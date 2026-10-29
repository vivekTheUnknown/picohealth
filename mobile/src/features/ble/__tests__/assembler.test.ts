import { FragmentAssembler, type AssemblyResult } from "@/features/ble/assembler";
import { buildFrame, concat, fragment } from "@/features/ble/__tests__/fixtures";

function expectComplete(result: AssemblyResult): Extract<AssemblyResult, { kind: "complete" }> {
  expect(result.kind).toBe("complete");
  return result as Extract<AssemblyResult, { kind: "complete" }>;
}

describe("FragmentAssembler", () => {
  it("reassembles the firmware's two fragments", () => {
    const frame = buildFrame();
    const packets = fragment(frame, 7);
    expect(packets).toHaveLength(2);

    const assembler = new FragmentAssembler();
    expect(assembler.add(packets[0]).kind).toBe("pending");
    const complete = expectComplete(assembler.add(packets[1]));

    expect(complete.sequence).toBe(7);
    expect(complete.fragments).toBe(2);
    expect(Array.from(complete.bytes)).toEqual(Array.from(frame));
  });

  it("reassembles out-of-order fragments", () => {
    const frame = buildFrame();
    const packets = fragment(frame, 9);
    const assembler = new FragmentAssembler();

    expect(assembler.add(packets[1]).kind).toBe("pending");
    const complete = expectComplete(assembler.add(packets[0]));
    expect(Array.from(complete.bytes)).toEqual(Array.from(frame));
  });

  it("ignores an identical duplicate fragment", () => {
    const packets = fragment(buildFrame(), 11);
    const assembler = new FragmentAssembler();

    assembler.add(packets[0]);
    expect(assembler.add(packets[0]).kind).toBe("ignored");
    const complete = expectComplete(assembler.add(packets[1]));
    expect(complete.sequence).toBe(11);
  });

  it("rejects a duplicate fragment with conflicting content", () => {
    const packets = fragment(buildFrame(), 12);
    const conflicting = Uint8Array.from(packets[0]);
    conflicting[5] = (conflicting[5] + 1) & 0xff;

    const assembler = new FragmentAssembler();
    assembler.add(packets[0]);
    const result = assembler.add(conflicting);

    expect(result).toMatchObject({ kind: "rejected", reason: "duplicate_conflict" });

    // The partial message is discarded rather than mixed: the next fragment
    // starts a fresh message, which can only complete once its first fragment
    // arrives again.
    expect(assembler.add(packets[1]).kind).toBe("pending");
    const recovered = expectComplete(assembler.add(packets[0]));
    expect(recovered.sequence).toBe(12);
  });

  it("drops an incomplete message when a new sequence starts", () => {
    const first = fragment(buildFrame(), 20);
    const second = fragment(buildFrame({ uptimeMs: 2000 }), 21);

    const assembler = new FragmentAssembler();
    assembler.add(first[0]);
    expect(assembler.add(second[0])).toMatchObject({
      kind: "rejected",
      reason: "superseded",
    });
    const complete = expectComplete(assembler.add(second[1]));
    expect(complete.sequence).toBe(21);
  });

  it("times out a stalled message instead of completing it later", () => {
    const packets = fragment(buildFrame(), 30);
    let clock = 1000;
    const assembler = new FragmentAssembler({ timeoutMs: 2000, now: () => clock });

    assembler.add(packets[0], clock);
    clock += 2500;

    expect(assembler.add(packets[1], clock)).toMatchObject({
      kind: "rejected",
      reason: "fragment_timeout",
    });
  });

  it("checkTimeout clears a stalled partial message", () => {
    const packets = fragment(buildFrame(), 31);
    let clock = 1000;
    const assembler = new FragmentAssembler({ timeoutMs: 500, now: () => clock });

    assembler.add(packets[0], clock);
    clock += 800;
    expect(assembler.checkTimeout()).toBe(true);
    expect(assembler.checkTimeout()).toBe(false);
  });

  it("rejects a fragment count beyond the limit", () => {
    const packet = new Uint8Array(8);
    packet[3] = 99; // count
    const assembler = new FragmentAssembler({ maxFragments: 16 });
    expect(assembler.add(packet)).toMatchObject({ kind: "rejected", reason: "bad_header" });
  });

  it("rejects a reassembled message above the size limit", () => {
    const payload = new Uint8Array(64);
    const packets = fragment(payload, 40);
    const assembler = new FragmentAssembler({ maxMessageBytes: 32 });

    const results = packets.map((packet) => assembler.add(packet));
    expect(results[results.length - 1]).toMatchObject({
      kind: "rejected",
      reason: "too_large",
    });
  });

  it("never completes with a missing middle fragment", () => {
    const payload = new Uint8Array(48);
    const packets = fragment(payload, 50);
    expect(packets).toHaveLength(3);

    const assembler = new FragmentAssembler();
    assembler.add(packets[0]);
    const result = assembler.add(packets[2]);
    expect(result.kind).toBe("pending");
  });

  it("passes TEST messages through without treating them as frames", () => {
    const assembler = new FragmentAssembler();
    const message = Uint8Array.from(Buffer.from("TEST:0042", "ascii"));
    expect(assembler.add(message)).toEqual({ kind: "test", text: "TEST:0042" });
  });

  it("can reassemble many frames in sequence", () => {
    const assembler = new FragmentAssembler();
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      const frame = buildFrame({ uptimeMs: sequence * 1000 });
      const packets = fragment(frame, sequence);
      assembler.add(packets[0]);
      const complete = expectComplete(assembler.add(packets[1]));
      expect(Array.from(complete.bytes)).toEqual(Array.from(frame));
    }
  });
});
