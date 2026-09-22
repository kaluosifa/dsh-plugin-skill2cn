import { defineConfig } from 'tsdown'

// 浏览器 module table 外部化清单（platform.ts L8-17）：宿主注入 require 解析
const HOST_EXTERNALS = [
  /^node:/,
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/schemastery',
  'yaml',
]

const PLATFORM_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-typert-protocol',
]

const CLIENT_ID = 'dsh-plugin-skill2cn'

export default defineConfig([
  {
    // Host 半身：node ESM，外部化一切依赖（profile node_modules 解析）
    // 先由 tsc 转译标准装饰器，tsdown 再打包 lib-tsc 产物
    entry: { index: 'lib-tsc/index.js' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: false,
    sourcemap: true,
    deps: { neverBundle: HOST_EXTERNALS },
    outputOptions: {
      entryFileNames: 'index.js',
    },
  },
  {
    // Client 半身：closure-factory CJS，banner/footer/intro 为宿主约定（tsdown.client.ts L558-569）
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
    },
    deps: { neverBundle: PLATFORM_EXTERNALS },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
