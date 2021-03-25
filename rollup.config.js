import ts from 'rollup-plugin-typescript2'
import serve from 'rollup-plugin-serve'
import { terser } from "rollup-plugin-terser";

const isProd = process.env.NODE_ENV === 'production';

export default {
    input: 'src/index.ts',
    output: {
        name: 'AbstractRPC',
        file: isProd ? 'dist/index.min.js' : 'dist/index.js',
        format: 'umd'
    },
    plugins: [
        ts(),
        isProd && terser(),
        !isProd && serve({
            contentBase: ['dist'],
            port: 7000
        })
    ]
};