import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const inert = new Proxy({}, { get: () => noop });
const store = new Map();
const context = vm.createContext({
  console,
  localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
});
const modules = new Map();
const mocks = new Map([
  ['src/game/audio.ts', { sfx: inert }],
  ['src/utils/haptics.ts', { haptics: inert }],
  ['src/game/multiplayer/partyManager.ts', { party: { roomId: null, isMultiplayer: false, opponents: new Map() } }],
  ['src/game/coinSync.ts', { coinSync: inert }],
  ['src/game/renderer.ts', { Renderer: class { constructor() { return inert; } } }],
].map(([path, exports]) => [resolve(root, path), exports]));

// Run the actual TypeScript logic without a browser; audio, rendering and
// network transports are inert. No source copies or compiled files are kept.
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function load(path) {
  const file = resolve(root, path);
  if (mocks.has(file)) return mocks.get(file);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const source = compile(readFileSync(file, 'utf8'));
  const run = vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename: file });
  run(name => name === 'react'
    ? { useRef: current => ({ current }), useEffect: effect => effect() }
    : load(resolve(dirname(file), `${name}.ts`)), module, module.exports);
  return module.exports;
}

const engine = load('src/game/engine.ts');
const { Game } = engine;

test('resizing keeps existing and future terrain, enemies, players and effects aligned', () => {
  engine.setViewportSize(400, 225);
  const baseline = new Game({});
  const resized = new Game({});
  baseline.startRun(42);
  resized.startRun(42);
  baseline.worldGen.generate(5000);
  resized.worldGen.generate(5000);
  const enemy = resized.enemies[0];
  assert.ok(enemy, 'fixture must include a moving enemy');
  const bounds = { x: enemy.x, minX: enemy.minX, maxX: enemy.maxX };
  const powerupX = resized.worldGen.nextPowerUpX;
  resized.ghosts.push({ x: 100, y: 100, life: 10 });
  resized.particles.spawnP(100, 100, 0, 0, 10, 1, '#ffffff');
  resized.texts.texts.push({ x: 100 });
  const previousX = resized.px;
  engine.setViewportSize(240, 400);
  resized.reanchorAfterResize(400);
  const delta = resized.px - previousX;
  assert.equal(delta, -45);
  for (const key of ['x', 'minX', 'maxX']) assert.equal(enemy[key], bounds[key] + delta);
  assert.equal(resized.worldGen.nextPowerUpX, powerupX + delta);
  assert.equal(resized.ghosts[0].x, 100 + delta);
  assert.equal(resized.particles.alive[0].x, 100 + delta);
  assert.equal(resized.texts.texts[0].x, 100 + delta);
  baseline.worldGen.generate(7000);
  resized.worldGen.generate(7000 + delta);
  assert.equal(resized.platforms.length, baseline.platforms.length);
  for (let i = 0; i < baseline.platforms.length; i++) {
    const a = baseline.platforms[i], b = resized.platforms[i];
    assert.ok(Math.abs(b.x - a.x - delta) < 1e-9);
    assert.equal(b.y, a.y);
    assert.equal(b.w, a.w);
  }

  resized.startLocalBattle(['bob', 'bob', 'bob']);
  const positions = resized.localPlayers.map(p => p.px);
  engine.setViewportSize(400, 225);
  resized.reanchorAfterResize(240);
  resized.localPlayers.forEach((p, i) => assert.equal(p.px, positions[i] + 45));
  resized.mode = 'online';
  const onlineX = resized.px, onlineStart = resized.startX, onlineCursor = resized.worldGen.genX;
  engine.setViewportSize(240, 400);
  resized.reanchorAfterResize(400);
  assert.equal(resized.px, onlineX);
  assert.equal(resized.startX, onlineStart);
  assert.equal(resized.worldGen.genX, onlineCursor);
});

test('all local players retain countdown taps and jump when GO ends', () => {
  engine.setViewportSize(400, 225);
  const game = new Game({});
  game.startLocalBattle(['bob', 'bob', 'bob', 'bob']);
  for (let i = 0; i < 4; i++) {
    game.pressPlayerJump(i);
    game.releasePlayerJump(i);
  }
  assert.ok(game.jumpBuf > 0);
  game.localPlayers.slice(1).forEach(p => assert.equal(p.jumpBuf, game.jumpBuf));
  while (game.countdown > 0) game.step();
  game.step();
  assert.ok(game.vy < 0);
  game.localPlayers.slice(1).forEach(p => assert.ok(p.vy < 0));
  game.pressPlayerJump(1);
  game.releasePlayerJump(1);
  assert.equal(game.localPlayers[1].jumpBuf, 0, 'ordinary releases still cancel the buffer');
});

test('unassigned controllers and keyboard schemes cannot control local players', () => {
  const handlers = new Map();
  let probe, frame;
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: [] };
  context.window = {
    addEventListener: (event, callback) => handlers.set(event, callback),
    setInterval: callback => { probe = callback; return 1; },
  };
  context.document = { body: { classList: { add: noop, remove: noop } }, querySelector: () => null };
  context.navigator = { getGamepads: () => [pad] };
  context.requestAnimationFrame = callback => { frame = callback; return 1; };
  mocks.set(resolve(root, 'src/game/input.ts'), {
    inputManager: { onGamepadUpdate: () => noop, onAction: () => noop },
  });
  const game = new Game({});
  game.startLocalBattle(['bob', 'bob'], undefined, ['wasd', 'arrows']);
  load('src/components/useGameInput.ts').useGameInput({
    gameRef: { current: game }, ui: 'playing',
    onStart: noop, onPause: noop, onResume: noop, onToggleMute: noop,
    onRestartHint: noop, onRestart: noop,
  });
  const key = code => ({ code, target: null, repeat: false, preventDefault: noop });
  handlers.get('keydown')(key('KeyD'));
  assert.equal(game.moveDir, 1);
  probe();
  frame();
  assert.equal(game.moveDir, 1, 'idle unassigned controller must not cancel keyboard movement');
  game.playerControls = ['gp0', 'arrows'];
  game.setMove(0);
  handlers.get('keydown')(key('KeyD'));
  assert.equal(game.moveDir, 0, 'unassigned WASD must be ignored');
  game.setMove(1);
  handlers.get('keyup')(key('KeyD'));
  assert.equal(game.moveDir, 1, 'unassigned releases must also be ignored');
  pad.axes[0] = -1;
  frame();
  assert.equal(game.moveDir, -1, 'assigned controller must still work');
});

test('paused solo runs finalize once before retry or menu resets the engine', () => {
  // Extract the actual callbacks so these checks exercise their guards and
  // ordering without mounting the complete application and its modals.
  const source = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useCallback') {
      callbacks.set(node.name.text, node.initializer.arguments[0].getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const action of ['restart', 'toMenu']) {
    const events = [];
    const game = { mode: 'solo', phase: 'paused', stats: { score: 200, meters: 50 }, toReady: () => events.push('reset') };
    const scope = vm.createContext({
      gameRef: { current: game }, runFinalizedRef: { current: false },
      persistRunResult: stats => { assert.equal(stats.score, 200); events.push('save'); },
      matchResult: null, localBattleConfigRef: { current: null }, startLocalBattle: noop,
      start: () => events.push('reset'), party: { leave: noop }, commitQuestRun: noop,
      setMatchResult: noop, setBattleModalOpen: noop, setQuestRecord: noop, loadQuestRecord: noop,
      sfx: inert, setUi: noop, setBest: noop, bestScore: noop, setFirstJumpHelp: noop,
      pendingFeedbackPromptRef: { current: false },
    });
    for (const name of ['finalizeActiveRun', action]) {
      scope[name] = vm.runInContext(compile(`(${callbacks.get(name)})`), scope);
    }
    scope[action]();
    assert.deepEqual(events, ['save', 'reset']);
    scope.finalizeActiveRun();
    assert.deepEqual(events, ['save', 'reset'], 'a run must not be counted twice');
  }
});
