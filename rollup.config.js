import strip from '@rollup/plugin-strip';
import terser from "@rollup/plugin-terser"
import typescript from "@rollup/plugin-typescript"

export default [

    {
        input: 'js/index.ts',
        output: [
            {file: 'dist/igv.esm.js', format: 'es'},
            {file: 'dist/igv.esm.min.js', format: 'es', sourcemap: true, plugins: [terser()]}
        ],
        plugins: [
            typescript({tsconfig: './tsconfig.json', noEmit: false, declaration: false, outDir: 'dist'}),
            strip({
                debugger: true,
                functions: [/*'console.log', */'assert.*', 'debug']
            })
        ]
    },

    {
        input: 'js/index.ts',
        output: [
            {file: 'dist/igv.js', format: 'umd', name: "igv"},
            {file: 'dist/igv.min.js', format: 'umd', name: "igv", sourcemap: true, plugins: [terser()]},
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
