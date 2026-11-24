# OMP MCP Find

A local OMP extension with one read-only tool: `mcp_find`. It returns one matching enabled MCP method and its argument schema by default (`limit` allows up to three). It never invokes the method.

Ask an MCP question normally. For an unknown method or signature, the tool description tells the model to try one focused lookup, then fall back to `help://eval/<namespace>` if needed. If it already knows the signature, it can call the method directly. A returned name works in native Eval as `await tool[name](args)` under OMP's normal approvals.

## Native MCP namespaces

This separate OMP setting keeps MCP method schemas out of the upfront tool list. The extension does not change it or replace native Eval. See the [namespace verification](docs/pdd/mcp-namespaces.md) and the [finder measurements](docs/pdd/mcp-find.md).

```sh
omp config get mcp.evalNamespaces
omp config set mcp.evalNamespaces true  # enable for new sessions
omp config reset mcp.evalNamespaces    # restore the default (false)
```

## Local install and checks

From this directory, link the entry point and start a new OMP process:

```sh
ln -s "$PWD/mcp-find.js" "$HOME/.omp/agent/extensions/mcp-find.js"
```

To uninstall, remove the `mcp-find.js` symlink. Run `node --test test/mcp-find.test.mjs` for the OMP integration checks.
