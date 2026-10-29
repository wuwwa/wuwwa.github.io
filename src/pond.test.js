import test from "node:test";
import assert from "node:assert/strict";
import { PondWorld, KoiPond, PondRenderer } from "./koi-pond.js";

test("swimming remains finite and articulated over a simulated minute", () => {
  const world = new PondWorld();
  world.resize(1280, 720);
  assert.equal(world.koi.length, 6);
  const initial = world.koi.map((fish) => [...fish.nodes]);
  for (let i = 0; i < 3600; i++) world.step(1 / 60);
  for (const [index, fish] of world.koi.entries()) {
    assert.ok([...fish.nodes].every(Number.isFinite));
    assert.notDeepEqual([...fish.nodes], initial[index]);
    for (let i = 1; i < 20; i++) {
      const distance = Math.hypot(
        fish.nodes[i * 2] - fish.nodes[(i - 1) * 2],
        fish.nodes[i * 2 + 1] - fish.nodes[(i - 1) * 2 + 1],
      );
      assert.ok(Math.abs(distance - fish.length / 19) < 0.001);
    }
  }
});

test("feeding caps pellets, makes ripples, and food eventually clears", () => {
  const world = new PondWorld();
  world.resize(1280, 720);
  for (let i = 0; i < 20; i++) world.feed(640, 300);
  assert.equal(world.pellets.length, 24);
  assert.ok(world.ripples.length > 0);
  for (let i = 0; i < 1000; i++) world.step(1 / 60);
  assert.equal(world.pellets.length, 0);
});

test("mobile pond seeds fewer fish and survives resizing", () => {
  const world = new PondWorld();
  world.resize(390, 844);
  assert.equal(world.koi.length, 3);
  world.resize(844, 390);
  for (let i = 0; i < 600; i++) world.step(1 / 60);
  assert.ok(world.koi.every((fish) => [...fish.nodes].every(Number.isFinite)));
});

test("hidden desktop elements do not create mobile avoidance regions", () => {
  const previousDocument = globalThis.document;
  const hidden = { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 };
  const visible = {
    width: 342,
    height: 235,
    left: 24,
    top: 561,
    right: 366,
    bottom: 796,
  };
  globalThis.document = {
    querySelectorAll: () =>
      [hidden, visible].map((rect) => ({ getBoundingClientRect: () => rect })),
  };
  try {
    let dimBoxes;
    const controller = {
      canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
      world: {},
      renderer: {
        setDimBoxes: (boxes) => {
          dimBoxes = boxes;
        },
      },
    };
    KoiPond.prototype.measureContent.call(controller);
    assert.deepEqual(dimBoxes, [
      { left: 24, top: 561, right: 366, bottom: 796 },
    ]);
    assert.deepEqual(controller.world.avoid, dimBoxes);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("variety markings remain distinct when reusing a fish id", () => {
  const canvas = { getContext: () => ({ canvas }) };
  const renderer = new PondRenderer(canvas);
  const kohaku = renderer.markings({ id: 1, variety: "kohaku" });
  const sanke = renderer.markings({ id: 1, variety: "sanke" });
  const tancho = renderer.markings({ id: 1, variety: "tancho" });
  assert.equal(kohaku.black.length, 0);
  assert.ok(sanke.black.length > 0);
  assert.equal(tancho.red.length, 1);
  assert.equal(tancho.black.length, 0);
});
