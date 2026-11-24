# OMP Code Mode

A local extension for OMP 19.1.1. It tells the model to prefer native JavaScript `eval` for dependent calls, parallel calls, or filtering large results. It leaves ordinary tools and approvals in place. No OMP patch, package install, or credentials required.

## Use

Start OMP normally. Try: **Use Code Mode to read `README.md` and `codemode.js` in parallel and return only their line counts.** The model can use normal `eval` with `language: "js"` and the `tool.*` bridge. Simple single-tool requests can still use direct calls.

- `/codemode` — show status and whether JavaScript `eval` is available.
- `/codemode off` — stop the guidance for this OMP process.
- `/codemode on` — re-enable it. New processes start enabled.

The extension does not turn on disabled tools. OMP's Eval exposes host APIs and is not Pi's QuickJS sandbox. Code Mode changes the model's guidance, not the runtime's permissions or output retention.

## MCP Code Mode

OMP 19.1.1 can expose MCP servers as native Eval namespaces instead of sending each method as a direct tool or command. Method signatures are available on demand at `help://eval/<namespace>`. Calls through the namespace still use OMP's tool approvals. Built-in tools remain available directly.

```sh
omp config get mcp.evalNamespaces
omp config set mcp.evalNamespaces true  # enable for new sessions
omp config reset mcp.evalNamespaces    # restore the default (false)
```

`/codemode off` turns off this extension's guidance, not OMP's native MCP namespaces. See the [MCP verification and token measurements](docs/pdd/mcp-namespaces.md).

## Local install and checks

From this directory, link the entry point and start a new OMP process:

```sh
ln -s "$PWD/codemode.js" "$HOME/.omp/agent/extensions/codemode.js"
```

To uninstall, remove that symlink. Run `node --test test/codemode.test.mjs` for the pre-install OMP integration tests. Set `CODEMODE_TEST_INSTALLED=1` to include discovery from the active OMP profile. See the [verification receipt](docs/pdd/codemode.md).
