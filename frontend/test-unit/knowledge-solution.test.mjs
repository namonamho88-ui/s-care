import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../components/knowledge-solution.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(require, module, module.exports);
const render = value => renderToStaticMarkup(React.createElement(module.exports.KnowledgeSolution, { value }));

test('verification becomes readable steps and metrics without concealing failures', () => {
  const html = render('승인된 가상 복구 조치의 검증 기록: ' + JSON.stringify({
    before: { blockingTransactions: 2, processedCount: 984 }, after: { blockingTransactions: 0, processedCount: 1000 },
    steps: [{ label: '잠금 해제', passed: true }], checks: [{ label: '대사', expected: 1000, actual: 984, passed: false }], passed: false,
  }));
  for (const text of ['<table', '차단 트랜잭션 수', '984', '1000', '잠금 해제', '실패', '<details>']) assert.ok(html.includes(text), text);
});
test('authored prose and malformed records remain intact and HTML is escaped', () => {
  for (const text of ['직접 작성한 해결 방법', '승인된 가상 복구 조치의 검증 기록: {broken']) assert.ok(render(text).includes(text));
  assert.ok(!render('<script>alert(1)</script>').includes('<script>'));
});
