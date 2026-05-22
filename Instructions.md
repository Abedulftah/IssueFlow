Skills files
------------

This repository stores reusable "skill" definitions (used by internal agents and workflows) in the `.claude/skills` folder at the repository root. Each skill lives in its own subfolder and typically contains a `SKILL.md` file with the skill description and usage instructions.

Examples:

- `/.claude/skills/openspec-apply-change/SKILL.md` — skill for applying OpenSpec changes
- `/.claude/skills/openspec-propose/SKILL.md` — skill for proposing OpenSpec changes

Notes about `openspec` vs skills:

- The `openspec/` directory contains specification documents and change proposals (for example `openspec/changes/*/proposal.md` and `openspec/changes/*/design.md`). These are project specs and not the SKILL definitions.
- The actual SKILL definitions used by agents are under `/.claude/skills/`.