# Third-party notices

This plugin drives **cua-driver** from [trycua/cua](https://github.com/trycua/cua) as a stdio MCP server. The binary is not bundled; the panel can run the official installer after the user confirms.

- Source: https://github.com/trycua/cua
- License: MIT

```
MIT License

Copyright (c) 2025 Cua AI, Inc.

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

## GenOffice

The Office knowledge and desktop workflow skills draw on the public **GenOffice** documentation. GenOffice binaries and engine source are not included in this plugin.

- Source: https://github.com/genspark-ai/genoffice
- Reference release: v0.10.639.
- License: Apache-2.0 for the community repository; `ee/` has a separate enterprise license and is not used.
- Upstream skill: https://github.com/genspark-ai/genoffice/blob/v0.10.639/skills/genoffice/SKILL.md
- License and notices: https://github.com/genspark-ai/genoffice/blob/v0.10.639/LICENSE and https://github.com/genspark-ai/genoffice/blob/v0.10.639/NOTICE

The plugin's Office skills are newly written workflow summaries inspired by the upstream skill and README, with Windows computer-use instructions added. They do not bundle the upstream skill verbatim or copy its document engine. GenOffice and Genspark names belong to their respective owners; this plugin is not affiliated with or endorsed by them.
