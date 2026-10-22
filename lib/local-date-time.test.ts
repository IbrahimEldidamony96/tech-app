import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

test("sale times round-trip in Cairo, UTC and across DST transitions", () => {
  for (const zone of ["Africa/Cairo", "America/New_York", "UTC"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { localDateTime, saleDateUpdate } from './lib/local-date-time.ts';
      const times = ['2026-10-22T09:00:37.000Z', '2026-10-29T20:30:00.000Z', '2026-10-29T21:30:00.000Z',
        '2026-04-23T21:30:00.000Z', '2026-04-23T22:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'];
      for (const iso of times) assert.equal(saleDateUpdate(localDateTime(iso), iso), undefined);
      if (process.env.TZ === 'Africa/Cairo') {
        assert.equal(localDateTime(times[0]), '2026-10-22T12:00');
        assert.equal(saleDateUpdate('2026-10-22T13:00', times[0]), '2026-10-22T10:00:00.000Z');
        assert.throws(() => saleDateUpdate('2026-04-24T00:30', null));
      }
      if (process.env.TZ === 'America/New_York') assert.throws(() => saleDateUpdate('2026-03-08T02:30', null));
      assert.equal(saleDateUpdate('', times[0]), null);
      assert.equal(saleDateUpdate('', null), undefined);
    `], { encoding: "utf8", env: { ...process.env, TZ: zone }, windowsHide: true });
    assert.equal(result.status, 0, `${zone}: ${result.stderr}`);
  }
});
