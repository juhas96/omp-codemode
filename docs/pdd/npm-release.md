# Public package release: intent

- R1 / C1: Make `juhas96/omp-codemode` public so the existing repository and main branch can be read without credentials. Do not publish unrelated repositories or change plugin behavior.
- R2 / C2: Publish `omp-codemode@0.1.0` to the public npm registry. The tarball contains the manifest, README, and runtime entry, not tests, proof artifacts, or credentials. The `omp.extensions` manifest loads the same read-only `mcp_find` tool. The package adds no dependencies or install scripts.
- R3 / C3: A friend can install the public package with `omp plugin install omp-codemode`; a new OMP process can call `mcp_find` without an explicit extension path. The public GitHub install is an alternative.

## Trusted boundary and evidence plan

- GitHub CLI/API controls visibility for the requested repo. Check `gh repo view` and anonymous Git access after the change; first scan all local Git refs with `gitleaks git`. Only `juhas96/omp-codemode` is a target.
- npm `pack` produces the artifact npm publishes. Assert the exact packed file list, unchanged runtime bytes versus the pre-release commit, `omp.extensions`, and no dependencies or install scripts. In an isolated profile, load and call `mcp_find` with a scripted provider. A wrong manifest entry must fail the load proof.
- npm owns identity, authentication, and public package metadata. The public npm registry returned 404 for `omp-codemode` before this release. After publication, verify the version anonymously; install by name with an empty disposable OMP/npm home and exercise the tool again. Independently check the public GitHub install in an isolated home. These are verified install paths on OMP 19.1.1, not a claim about a friend's machine. npm login and required second factors remain with the operator. Registry publication is public and cannot reliably be undone.

No changes to the installed local symlink, MCP configuration, approvals, or native Eval.

## Pre-publication evidence

- `gitleaks git --redact=100 --no-banner .` found no leaks in the seven original commits. The remote had only `main`, no releases, issues, Actions runs or artifacts, and no wiki.
- `npm pack --json` produced exactly `README.md`, `mcp-find.js`, and `package.json`. The runtime matched `af6627c` byte for byte. The manifest has no dependencies or scripts. Pack integrity: `sha512-3heMyzXUvaXIe7wZoRLMKsGHtawFObr6E7+oU7M6ehruAQSmUYNifIrtU3OyoFN7dKaQuRS7Wq175Lx/gIMHUg==`.
- OMP 19.1.1 linked the unpacked artifact and a fresh isolated process invoked `mcp_find`, returning `{"matches":[]}` with an empty MCP catalog. A mutant manifest pointing at an absent file failed with unknown `mcp_find`.
