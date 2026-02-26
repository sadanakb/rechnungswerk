import { dirname } from 'path'
import { fileURLToPath } from 'url'
import withSerwistInit from '@serwist/next'

const __dirname = dirname(fileURLToPath(import.meta.url))

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  turbopack: {
    root: __dirname,
  },
}

export default withSerwist(nextConfig)
