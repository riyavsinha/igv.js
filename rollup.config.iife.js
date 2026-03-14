import strip from '@rollup/plugin-strip';
import terser from "@rollup/plugin-terser"
import typescript from "@rollup/plugin-typescript"

export default [

    {
        input: 'js/index.js',
        output: [
            {file: 'dist/igv.iife.js', format: 'iife', name: "igv", sourcemap: true, plugins: [terser()]},
        ],
        plugins: [
            typescript({tsconfig: './tsconfig.json', noEmit: false, declaration: false, outDir: 'dist'}),
            strip({
                debugger: true,
                functions: [/*'console.log', */'assert.*', 'debug']
            }),
        ]
    }
];
