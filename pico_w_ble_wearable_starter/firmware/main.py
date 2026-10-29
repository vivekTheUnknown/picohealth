# Pico W BLE wearable starter. Requires MicroPython bluetooth + aioble.
# Temperature/IMU chip IDs are unconfirmed: both drivers remain invalid by default.
import time, struct
from machine import Pin, I2C
import bluetooth, aioble, uasyncio as asyncio

SDA, SCL, FREQ = 4, 5, 100000
TEMP_ADDRS = (0x48, 0x4C)
OPT_ADDR, IMU_ADDR = 0x57, 0x68
TEMP_DRIVER_VALID = False  # set True only after identifying and validating exact chip
IMU_DRIVER_VALID = False   # set True only after identifying and validating exact chip
NAME = 'PicoHealth-DEV'
SERVICE_UUID = bluetooth.UUID('8f2a0001-6b6d-4f9e-9f6d-6c2b2d0a0001')
DATA_UUID = bluetooth.UUID('8f2a0002-6b6d-4f9e-9f6d-6c2b2d0a0001')
FRAME_FMT = '>IBhIIhhhhhhB'
CHUNK = 16

i2c = I2C(0, sda=Pin(SDA), scl=Pin(SCL), freq=FREQ)
S = {'temp':None, 'red':None, 'ir':None, 'samples':0, 'accel':None, 'gyro':None,
     'ok':{'temp':False,'opt':False,'imu':False}, 'present':{'temp':False,'opt':False,'imu':False}}
seq = 0

def r(addr, reg, n=1): return i2c.readfrom_mem(addr, reg, n)
def w(addr, reg, val): i2c.writeto_mem(addr, reg, bytes([val]))
def u8(addr, reg): return r(addr, reg, 1)[0]
def s16(b, i):
    x=(b[i]<<8)|b[i+1]
    return x-65536 if x&0x8000 else x

def temp_addr():
    try:
        found=i2c.scan()
        for a in TEMP_ADDRS:
            if a in found: return a
    except OSError: pass
    return None

def read_temp_provisional(a):
    b=r(a,0x00,2); x=((b[0]<<8)|b[1])>>7
    if x&0x100: x-=512
    return x*0.5

def init_opt():
    if u8(OPT_ADDR,0xFF)!=0x15: raise OSError('unexpected optical Part ID')
    w(OPT_ADDR,0x09,0x40); time.sleep_ms(100)
    for reg in (0x04,0x05,0x06): w(OPT_ADDR,reg,0)
    w(OPT_ADDR,0x08,0x00); w(OPT_ADDR,0x0A,0x27)
    w(OPT_ADDR,0x0C,0x24); w(OPT_ADDR,0x0D,0x24); w(OPT_ADDR,0x09,0x03)

def read_opt():
    wr=u8(OPT_ADDR,0x04)&31; rd=u8(OPT_ADDR,0x06)&31
    rs=ii=n=0
    while rd!=wr and n<32:
        b=r(OPT_ADDR,0x07,6)
        rs+=(((b[0]<<16)|(b[1]<<8)|b[2])&0x3ffff)
        ii+=(((b[3]<<16)|(b[4]<<8)|b[5])&0x3ffff)
        n+=1; rd=(rd+1)&31
    return (rs//n,ii//n,n) if n else (None,None,0)

def init_imu_provisional(): w(IMU_ADDR,0x6B,0)
def read_imu_provisional():
    b=r(IMU_ADDR,0x3B,14)
    ax,ay,az=s16(b,0),s16(b,2),s16(b,4)
    gx,gy,gz=s16(b,8),s16(b,10),s16(b,12)
    return ((ax/16384,ay/16384,az/16384),(gx/131,gy/131,gz/131))

async def temp_task():
    while True:
        try:
            a=temp_addr()
            if a is None: raise OSError('temperature sensor absent')
            val=read_temp_provisional(a)
            S['present']['temp']=True
            S['temp']=val if TEMP_DRIVER_VALID else None
            S['ok']['temp']=TEMP_DRIVER_VALID
        except Exception as e:
            S['temp']=None; S['ok']['temp']=False; S['present']['temp']=False; print('TEMP error:',repr(e))
        await asyncio.sleep_ms(1000)

async def optical_task():
    initialized=False
    while True:
        try:
            if OPT_ADDR not in i2c.scan(): raise OSError('MAX30102 absent')
            if not initialized: init_opt(); initialized=True
            red,ir,n=read_opt()
            S['present']['opt']=True
            if n:
                S['red'],S['ir'],S['samples']=red,ir,min(255,n)
            S['ok']['opt']=True
        except Exception as e:
            S['red']=S['ir']=None; S['samples']=0; S['ok']['opt']=False; S['present']['opt']=False
            initialized=False; print('OPTICAL error:',repr(e))
        await asyncio.sleep_ms(20)

async def imu_task():
    initialized=False
    while True:
        try:
            if IMU_ADDR not in i2c.scan(): raise OSError('IMU absent')
            if not initialized: init_imu_provisional(); initialized=True
            a,g=read_imu_provisional()
            S['present']['imu']=True
            S['accel']=a if IMU_DRIVER_VALID else None
            S['gyro']=g if IMU_DRIVER_VALID else None
            S['ok']['imu']=IMU_DRIVER_VALID
        except Exception as e:
            S['accel']=S['gyro']=None; S['ok']['imu']=False; S['present']['imu']=False
            initialized=False; print('IMU error:',repr(e))
        await asyncio.sleep_ms(50)

def scaled(x, factor):
    if x is None: return -32768
    return max(-32767,min(32767,int(x*factor)))

def make_frame():
    flags=0; t=S['temp']; red=S['red']; ir=S['ir']; a=S['accel']; g=S['gyro']
    if S['present']['temp']: flags |= 0x08
    if S['present']['opt']: flags |= 0x10
    if S['present']['imu']: flags |= 0x20
    if S['ok']['temp'] and t is not None: flags|=1; ti=scaled(t,100)
    else: ti=-32768
    if S['ok']['opt'] and red is not None and ir is not None:
        flags|=2; ri=max(0,min(0xfffffffe,int(red))); ii=max(0,min(0xfffffffe,int(ir)))
    else: ri=ii=0xffffffff
    if S['ok']['imu'] and a is not None and g is not None:
        flags|=4; aa=[scaled(v,1000) for v in a]; gg=[scaled(v,100) for v in g]
    else: aa=gg=[-32768,-32768,-32768]
    return struct.pack(FRAME_FMT,time.ticks_ms()&0xffffffff,flags,ti,ri,ii,
                       aa[0],aa[1],aa[2],gg[0],gg[1],gg[2],min(255,S['samples']))

async def ble_task():
    global seq
    ble=bluetooth.BLE(); ble.active(True)
    try: ble.config(gap_name=NAME)
    except Exception: pass
    service=aioble.Service(SERVICE_UUID)
    data_char=aioble.Characteristic(service,DATA_UUID,read=True,notify=True)
    aioble.register_services(service)
    print('BLE advertising:',NAME)
    while True:
        try:
            conn=await aioble.advertise(250000,name=NAME,services=[SERVICE_UUID])
            print('BLE connected')
            async with conn:
                while conn.is_connected():
                    frame=make_frame(); seq=(seq+1)&0xffff
                    pieces=[frame[i:i+CHUNK] for i in range(0,len(frame),CHUNK)]
                    for idx,piece in enumerate(pieces):
                        packet=struct.pack('>HBB',seq,idx,len(pieces))+piece
                        try: await data_char.notify(conn,packet)
                        except Exception as e:
                            print('Notify interrupted:',repr(e)); break
                    await asyncio.sleep_ms(1000)
        except Exception as e:
            print('BLE error; retrying:',repr(e)); await asyncio.sleep_ms(1000)

async def main():
    print('PicoHealth boot. I2C:',[hex(x) for x in i2c.scan()])
    await asyncio.gather(temp_task(),optical_task(),imu_task(),ble_task())

asyncio.run(main())
