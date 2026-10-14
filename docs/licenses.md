# Third-party notices and dependency licenses

TraceVerse's original source is licensed under [MIT](../LICENSE). Dependencies remain under their respective upstream licenses; this project does not relicense them or claim every dependency is MIT.

Run `npm run audit:licenses` after a clean install to generate [dependency-licenses.json](dependency-licenses.json). The inventory covers the lockfile's packages, including optional/platform-specific dependencies that may not be installed on your machine. It is metadata plus narrowly reviewed exceptions, not a substitute for each package's license text. Installed packages retain their upstream notices and licenses.

Source releases publish TraceVerse source and a lockfile without `node_modules`, optional libvips binaries, or a bundled installer. The v0.2.0 GitHub Pages demo also redistributes compiled browser dependencies. Its generated `third-party-notices.txt` preserves the full upstream notices for that selected dependency closure, including MIT and Apache-licensed packages; it is served alongside the demo at [third-party-notices.txt](https://prohz189hh-boop.github.io/traceverse/third-party-notices.txt).

The lockfile inventory includes development tools and optional Next.js packages that do not all ship in the browser bundle. MPL-licensed CSS tooling is used during builds and is not browser runtime code; optional LGPL libvips binaries are not included in the static site. Any future binary/installer distribution needs complete notices and review of its exact distributed artifacts.

## Reviewed exceptions

| Dependency                                              | License / review                                                                | Use and upstream source                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lightningcss` and platform packages                    | MPL-2.0                                                                         | Unmodified CSS build tooling in separate dependency files. [Source and upstream license](https://github.com/parcel-bundler/lightningcss)                                                                                                                |
| `caniuse-lite`                                          | CC-BY-4.0                                                                       | Unmodified browser support dataset used by tooling. Data source: [Can I use](https://caniuse.com/), distributed through [caniuse-lite](https://github.com/browserslist/caniuse-lite). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)         |
| Optional `@img/sharp-libvips-*` 1.3.4 platform packages | LGPL-3.0-or-later                                                               | Optional Next.js image dependency, dynamically used by sharp; no native binary is redistributed in this source release. [libvips source](https://github.com/libvips/libvips) and [sharp installation details](https://sharp.pixelplumbing.com/install/) |
| `webgl-constants` 1.1.1                                 | MIT, verified from installed `LICENSE` despite missing package license metadata | Copyright (c) 2019 Tim van Scherpenzeel; full notice preserved below                                                                                                                                                                                    |

The reviewed cases do not create a general allowlist for unrelated dependencies or future versions. Do not remove upstream notices or change a package's license label to make a check pass. New missing/unknown licenses need an explicit source review.

Browser support data used by `caniuse-lite` comes from **caniuse.com**. TraceVerse makes no modifications to that upstream dataset.

## Browser notice generation

Both builds run `scripts/notices.mjs` offline. Packages that omit license files use checked-in upstream texts in `docs/license-sources`, with their source URLs. The selected closure excludes native Tailwind tooling and Drei's unused StatsGl widget. The scene imports only Drei's OrbitControls module; camera controls do not load the unused statistics widget, vision models, or Draco decoders. Some optional dependency notices are included conservatively even though their modules are removed from the optimized build.

## webgl-constants 1.1.1 notice

The following notice was verified against the installed package's `LICENSE`:

```text
MIT License

Copyright (c) 2019 Tim van Scherpenzeel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
