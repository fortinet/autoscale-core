/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

module.exports = {
    entry: {
        index: './index.ts'
    },
    devtool: 'inline-source-map',
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    output: {
        filename: '[name]-bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    target: 'node'
};
