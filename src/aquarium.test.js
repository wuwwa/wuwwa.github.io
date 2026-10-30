import test from "node:test";
import assert from "node:assert/strict";
import { KoiPond } from "./aquarium/model.ts";

test("fish enter from outside the viewport without jumping and survive resizing", () => {
  const pond = new KoiPond();
  pond.resize(390, 844);
  const originalFish = [...pond.fish];
  assert.ok(
    pond.fish.every((fish) =>
      fish.spine.every(
        (point) =>
          point.x < 0 ||
          point.x > pond.width ||
          point.y < 0 ||
          point.y > pond.height,
      ),
    ),
  );
  for (let frame = 0; frame < 900; frame++) {
    const previous = pond.fish.map((fish) => ({ x: fish.x, y: fish.y }));
    pond.step(1 / 60);
    pond.fish.forEach((fish, index) =>
      assert.ok(
        Math.hypot(fish.x - previous[index].x, fish.y - previous[index].y) < 1,
      ),
    );
  }
  assert.ok(pond.fish.every((fish) => !fish.entering));
  for (const [width, height] of [
    [1280, 800],
    [320, 568],
    [844, 390],
  ]) {
    pond.resize(width, height);
    assert.equal(pond.fish.length, originalFish.length);
    pond.fish.forEach((fish, index) => assert.equal(fish, originalFish[index]));
  }
});

test("reduced motion starts with a visible stationary school", () => {
  const pond = new KoiPond();
  pond.setReduced(true);
  pond.resize(390, 844);
  assert.ok(
    pond.fish.every(
      (fish) =>
        fish.x > 0 &&
        fish.x < pond.width &&
        fish.y > 0 &&
        fish.y < pond.height &&
        !fish.entering,
    ),
  );
});

test("aquarium swimming stays bounded and articulated across viewport changes", () => {
  const pond = new KoiPond();
  pond.rain.setMode("off");
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
    [320, 568],
  ]) {
    pond.resize(width, height);
    pond.avoid = [
      { left: 24, right: width - 24, top: height * 0.6, bottom: height - 40 },
    ];
    for (let frame = 0; frame < 1800; frame++) pond.step(1 / 60);
    for (const fish of pond.fish) {
      assert.ok(
        fish.x >= 0 && fish.x <= width && fish.y >= 0 && fish.y <= height,
      );
      assert.ok(
        fish.spine.every((point) => Number.isFinite(point.x + point.y)),
      );
      for (let i = 1; i < fish.spine.length; i++) {
        const previous = fish.spine[i - 1],
          point = fish.spine[i];
        assert.ok(
          Math.abs(
            Math.hypot(point.x - previous.x, point.y - previous.y) -
              fish.length / 21,
          ) < 0.001,
        );
      }
    }
  }
});

test("aquarium feeding clears and reduced motion freezes swimming", () => {
  const pond = new KoiPond();
  pond.resize(390, 844);
  for (let i = 0; i < 30; i++) pond.tap(200, 200);
  assert.equal(pond.pellets.length, 24);
  for (let frame = 0; frame < 1000; frame++) pond.step(1 / 60);
  assert.equal(pond.pellets.length, 0);
  pond.attend(200, 200);
  pond.setReduced(true);
  const fish = structuredClone(pond.fish);
  for (let frame = 0; frame < 120; frame++) pond.step(1 / 60);
  assert.deepEqual(pond.fish, fish);
  assert.equal(pond.target, null);
});
