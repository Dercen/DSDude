/** Test helpers: a fake ChildProcess and fixture paths. Used only by *.test.ts. */
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

export { FIXTURE_ELF, FIXTURE_NITROFS, FIXTURE_PACKROM, FIXTURE_ROM } from "./fixtures.ts";

export interface FakeChild extends ChildProcess {
  /** Writes to stdout. */
  print(text: string): void;
  /** Writes to stderr. */
  printErr(text: string): void;
  /** Ends the streams and emits exit + close with `code`. */
  finish(code: number | null, signal?: NodeJS.Signals | null): void;
}

let nextPid = 4000;

export function fakeChild(pid: number | undefined = nextPid++): FakeChild {
  const emitter = new EventEmitter() as FakeChild;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let done = false;
  Object.assign(emitter, {
    pid,
    stdout,
    stderr,
    stdin: null,
    exitCode: null,
    print(text: string) {
      stdout.write(text);
    },
    printErr(text: string) {
      stderr.write(text);
    },
    finish(code: number | null, signal: NodeJS.Signals | null = null) {
      if (done) return;
      done = true;
      (emitter as { exitCode: number | null }).exitCode = code;
      stdout.end();
      stderr.end();
      // Let the stream 'data' events drain before close, as a real process does.
      setImmediate(() => {
        emitter.emit("exit", code, signal);
        emitter.emit("close", code, signal);
      });
    },
  });
  return emitter;
}
