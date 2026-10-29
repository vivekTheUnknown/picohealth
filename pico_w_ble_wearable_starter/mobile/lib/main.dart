import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:http/http.dart' as http;
import 'package:permission_handler/permission_handler.dart';

const serviceUuid='8f2a0001-6b6d-4f9e-9f6d-6c2b2d0a0001';
const dataUuid='8f2a0002-6b6d-4f9e-9f6d-6c2b2d0a0001';
const apiBaseUrl='http://10.0.2.2:8000'; // Android emulator; set laptop LAN IP for a physical phone.
const demoToken='dev-only-change-me';
extension<T> on Iterable<T> { T? get firstOrNull => isEmpty ? null : first; }

class Frame {
  Frame(this.uptime,this.flags,this.temp,this.red,this.ir,this.accel,this.gyro,this.samples);
  final int uptime,flags; final double? temp; final int? red,ir; final List<double>? accel,gyro; final int samples;
  bool get tempOk => (flags & 1) != 0 && temp!=null;
  bool get opticalOk => (flags & 2) != 0 && red!=null && ir!=null;
  bool get imuOk => (flags & 4) != 0 && accel!=null && gyro!=null;
  bool get tempPresent => (flags & 8) != 0;
  bool get opticalPresent => (flags & 16) != 0;
  bool get imuPresent => (flags & 32) != 0;
  Map<String,dynamic> toJson()=>{'patient_id':1,'device_id':'PicoHealth-DEV','uptime_ms':uptime,'sensor_flags':flags,'temperature_c':tempOk?temp:null,'red_raw':opticalOk?red:null,'ir_raw':opticalOk?ir:null,'accel_g':imuOk?accel:null,'gyro_dps':imuOk?gyro:null,'optical_samples':samples};
  factory Frame.decode(Uint8List b) {
    if(b.length!=28) throw FormatException('Frame must be 28 bytes; got ${b.length}');
    final d=ByteData.sublistView(b); final flags=d.getUint8(4); final tr=d.getInt16(5,Endian.big);
    final rr=d.getUint32(7,Endian.big), ir=d.getUint32(11,Endian.big);
    final ax=d.getInt16(15,Endian.big), ay=d.getInt16(17,Endian.big), az=d.getInt16(19,Endian.big);
    final gx=d.getInt16(21,Endian.big), gy=d.getInt16(23,Endian.big), gz=d.getInt16(25,Endian.big);
    return Frame(d.getUint32(0,Endian.big),flags,tr==-32768?null:tr/100,rr==0xffffffff?null:rr,ir==0xffffffff?null:ir,
      ax==-32768||ay==-32768||az==-32768?null:[ax/1000,ay/1000,az/1000],
      gx==-32768||gy==-32768||gz==-32768?null:[gx/100,gy/100,gz/100],d.getUint8(27));
  }
}
class Assembler {
  int? seq,count; final Map<int,List<int>> parts={};
  Uint8List? add(List<int> b) {
    if(b.length<5)return null; final s=(b[0]<<8)|b[1], i=b[2], n=b[3]; if(n<1||i>=n)return null;
    if(seq!=s){seq=s;count=n;parts.clear();} parts[i]=b.sublist(4); if(parts.length!=count)return null;
    final all=<int>[]; for(var j=0;j<n;j++){if(!parts.containsKey(j))return null;all.addAll(parts[j]!);} parts.clear();seq=null;count=null;return Uint8List.fromList(all);
  }
}
void main()=>runApp(const App());
class App extends StatelessWidget {const App({super.key}); @override Widget build(BuildContext c)=>MaterialApp(title:'PicoHealth',theme:ThemeData(colorSchemeSeed:Colors.teal,useMaterial3:true),home:const Home());}
class Home extends StatefulWidget {const Home({super.key}); @override State<Home> createState()=>_HomeState();}
class _HomeState extends State<Home> {
  BluetoothDevice? device; BluetoothCharacteristic? characteristic; StreamSubscription<List<int>>? notifySub; StreamSubscription<BluetoothConnectionState>? connSub;
  final assembler=Assembler(); final List<Frame> history=[]; Frame? latest; String status='Disconnected',backend='Not synced'; bool busy=false,saving=false; final Set<String> alertingNow={};
  Future<void> connect() async {
    setState(()=>busy=true);
    try {
      await [Permission.bluetoothScan,Permission.bluetoothConnect,Permission.locationWhenInUse].request();
      await FlutterBluePlus.startScan(withServices:[Guid(serviceUuid)],timeout:const Duration(seconds:10));
      final results=await FlutterBluePlus.scanResults.first.timeout(const Duration(seconds:12),onTimeout:()=>[]);
      final found=results.where((r)=>r.device.platformName=='PicoHealth-DEV').firstOrNull;
      await FlutterBluePlus.stopScan(); if(found==null)throw Exception('PicoHealth-DEV not found. Check Pico power and BLE firmware.');
      device=found.device; await device!.connect(timeout:const Duration(seconds:15),autoConnect:false);
      connSub?.cancel(); connSub=device!.connectionState.listen((s){if(mounted)setState(()=>status=s==BluetoothConnectionState.connected?'Connected':'Disconnected');});
      final services=await device!.discoverServices(); final service=services.where((s)=>s.uuid==Guid(serviceUuid)).firstOrNull;
      if(service==null)throw Exception('Wearable service missing');
      characteristic=service.characteristics.where((c)=>c.uuid==Guid(dataUuid)).firstOrNull;
      if(characteristic==null)throw Exception('Data characteristic missing');
      await characteristic!.setNotifyValue(true); notifySub?.cancel(); notifySub=characteristic!.onValueReceived.listen(onFragment);
      if(mounted)setState(()=>status='Connected — waiting for readings');
    } catch(e) {if(mounted)setState(()=>status='Connection error: $e'); try{await FlutterBluePlus.stopScan();}catch(_){}}
    if(mounted)setState(()=>busy=false);
  }
  void onFragment(List<int> bytes) {
    final raw=assembler.add(bytes); if(raw==null)return;
    try {final f=Frame.decode(raw); if(!mounted)return; setState(() { latest=f; history.insert(0,f); if(history.length>200) history.removeLast(); });
      _monitorSensor('temperature', f.tempPresent); _monitorSensor('optical', f.opticalPresent); _monitorSensor('IMU', f.imuPresent); save(f);}catch(e){debugPrint('Bad BLE frame: $e');}
  }

  void _monitorSensor(String name, bool present) {
    if (!present && alertingNow.add(name)) {
      alert(name); // one alert on each loss episode; no repeated alert spam
    } else if (present) {
      alertingNow.remove(name);
    }
  }
  Future<void> save(Frame f) async {
    if(saving)return; saving=true;
    try {final r=await http.post(Uri.parse('$apiBaseUrl/measurements'),headers:{'Content-Type':'application/json','Authorization':'Bearer $demoToken'},body:jsonEncode(f.toJson())).timeout(const Duration(seconds:4)); if(mounted)setState(()=>backend=r.statusCode==200||r.statusCode==201?'Backend synced':'Backend HTTP ${r.statusCode}');}
    catch(_){if(mounted)setState(()=>backend='Backend unavailable; BLE live data continues');} finally{saving=false;}
  }
  Future<void> loadHistory() async {try{final r=await http.get(Uri.parse('$apiBaseUrl/patients/1/measurements?limit=100'),headers:{'Authorization':'Bearer $demoToken'}).timeout(const Duration(seconds:4));if(mounted)setState(()=>backend=r.statusCode==200?'Backend history reachable':'History HTTP ${r.statusCode}');}catch(e){if(mounted)setState(()=>backend='History unavailable: $e');}}
  Future<void> alert(String sensor) async {try{await http.post(Uri.parse('$apiBaseUrl/alerts'),headers:{'Content-Type':'application/json','Authorization':'Bearer $demoToken'},body:jsonEncode({'patient_id':1,'severity':'warning','code':'SENSOR_UNAVAILABLE','message':'$sensor unavailable or unvalidated'})).timeout(const Duration(seconds:4));if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Demo alert saved for $sensor')));}catch(_){if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not save alert to backend')));}}
  Widget sensor(String name,String value,String detail,bool ok,String key)=>Card(child:ListTile(leading:Icon(ok?Icons.check_circle:Icons.error_outline,color:ok?Colors.green:Colors.orange),title:Text(name),subtitle:Text(detail),trailing:SizedBox(width:150,child:Text(value,textAlign:TextAlign.end)),onLongPress:()=>alert(key)));
  @override void dispose(){notifySub?.cancel();connSub?.cancel();device?.disconnect();super.dispose();}
  @override Widget build(BuildContext context){final f=latest;return Scaffold(appBar:AppBar(title:const Text('PicoHealth • Patient')),body:ListView(padding:const EdgeInsets.all(16),children:[
    Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Wearable',style:Theme.of(context).textTheme.titleLarge),Text(status),Text(backend,style:Theme.of(context).textTheme.bodySmall),const SizedBox(height:8),Wrap(spacing:8,children:[FilledButton.icon(onPressed:busy?null:connect,icon:const Icon(Icons.bluetooth_searching),label:Text(busy?'Connecting…':'Connect')),OutlinedButton.icon(onPressed:loadHistory,icon:const Icon(Icons.history),label:const Text('Check history'))])]))),
    const SizedBox(height:8),const Text('Live sensor status',style:TextStyle(fontSize:20,fontWeight:FontWeight.bold)),const Text('Prototype data only — not for medical decisions.',style:TextStyle(color:Colors.deepOrange)),
    sensor('Temperature',f?.tempOk==true?'${f!.temp!.toStringAsFixed(2)} °C':'Unavailable / unvalidated',f?.tempOk==true?'Validated driver':'${f?.tempPresent==true?'Connected; driver unverified':'Disconnected / not detected'}',f?.tempOk==true,'temperature'),
    sensor('Optical (raw)',f?.opticalOk==true?'R ${f!.red} • IR ${f.ir}':'Unavailable',f?.opticalOk==true?'${f!.samples} samples; raw only':(f?.opticalPresent==true?'Connected; awaiting samples':'Disconnected / not detected'),f?.opticalOk==true,'optical'),
    sensor('Motion (IMU)',f?.imuOk==true?'${f!.accel} g':'Unavailable / unvalidated',f?.imuOk==true?'Gyro ${f!.gyroDps}':'${f?.imuPresent==true?'Connected; driver unverified':'Disconnected / not detected'}',f?.imuOk==true,'IMU'),
    const SizedBox(height:12),Text('Live session history (${history.length} frames)',style:const TextStyle(fontSize:20,fontWeight:FontWeight.bold)),...history.take(30).map((x)=>ListTile(dense:true,leading:const Icon(Icons.timeline),title:Text('Uptime ${x.uptime} ms'),subtitle:Text('Temp ${x.tempOk?x.temp!.toStringAsFixed(2)+' °C':'N/A'} • Optical ${x.opticalOk?'raw available':'N/A'} • IMU ${x.imuOk?'available':'N/A'}'))),
    const SizedBox(height:12),const Text('Doctor portal',style:TextStyle(fontSize:20,fontWeight:FontWeight.bold)),const Text('Run the FastAPI backend and open /portal on your trusted development network. Demo portal has no clinician login.'),
  ]));}
}
