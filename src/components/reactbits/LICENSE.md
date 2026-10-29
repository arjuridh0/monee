MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

The same restriction covers the React Bits tools (Background Studio, Texture Lab, Shape Magic, Center Stage, Sound Lab and any tools added later) and the sounds in the sound library. **You may not sell, sublicense, or redistribute the tools or the sounds themselves, or offer the tools or a substantially similar copy of them as a hosted service-whether alone, in a bundle, or as a ported version.**

What you make with the tools is yours to use. You can use exported code, images, videos, and audio files in any personal or commercial application, website, or product, including paid ones. **You may not sell or redistribute the exports on their own, either individually or as the product itself, such as a sound, texture, background, or template pack.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Monee adaptations

Sources accessed 24 October 2026:
- https://reactbits.dev/r/FlipCard-TS-TW
- https://reactbits.dev/r/CodeSlots-TS-TW
- https://reactbits.dev/r/RubberSegment-TS-TW
- https://reactbits.dev/r/FuseButton-TS-TW
- https://raw.githubusercontent.com/DavidHDev/react-bits/main/LICENSE.md

These are purpose-built Monee adaptations, not drop-in copies of the full upstream API. Monee uses installed `framer-motion`, Lucide icons, native password input editing, explicit flip controls, app tokens, asynchronous commit/undo error handling, and a timer independent of decorative animation. Tilt/glare, momentum dragging of segments, SMS autofill, hover-paused undo and unused cosmetic options are not included. No React Bits Pro source is used.

Registry source was downloaded again during the 24 October 2026 audit fixes and is recorded with SHA-256 hashes in `src/components/reactbits/upstream.json`. FlipCard follows upstream's two faces, backface visibility, inactive inert content and 180-degree rotor, with app-specific child controls and adaptive height. CodeSlots uses the upstream bounce 0.2, settle 0.3 seconds and 20ms digit cascade, plus a visible active-slot caret; PIN masking stays enabled. RubberSegment retains the rounded rectangle thumb and spring selection. FuseButton retains press/fuseEnd and idle/armed/settled phases; Monee adds asynchronous validation, guarded persistence/undo and an 800ms visible settled interval before closing a dialog.
