# OMP MCP Find

A local OMP extension with one read-only tool: `mcp_find`. It returns one matching enabled MCP method and its argument schema by default (`limit` allows up to three). It never invokes the method.

## Install

```sh
omp plugin install omp-codemode
```

Or install directly from GitHub:

```sh
omp plugin install github:juhas96/omp-codemode
```

Start a fresh OMP session. Tested with OMP 19.1.1. If you previously installed the extension by symlink, remove that symlink before installing the plugin so OMP loads only one copy.

Ask an MCP question normally. For an unknown method or signature, the tool description tells the model to try one focused lookup, then fall back to `help://eval/<namespace>` if needed. If it already knows the signature, it can call the method directly. A returned name works in native Eval as `await tool[name](args)` under OMP's normal approvals.

## Measured token savings

Real Business Central MCP lookups in fresh Rex sessions, using OMP 19.1.1 and local Qwen3.6-35B-A3B. Both discovery routes found the correct method. No MCP method had to be executed for discovery.

| Time-zone method lookup | Full namespace help | `mcp_find` | Reduction |
| --- | ---: | ---: | ---: |
| Total model tokens (including cached input) | 29,618 | 24,100 | 18.6% |
| Tool result size | 22,573 bytes | 276 bytes | 98.8% |

Retries can erase the savings. In separate runs, the app-updates lookup took 54,070 tokens with three searches and a fallback, versus 23,901 with one lookup in the current finder-only setup. These are individual runs, not a guaranteed reduction.

Separately, enabling OMP's native MCP namespaces reduced first-request input from 14,925 to 12,716 tokens (14.8%) in a live Business Central test. That saving comes from OMP's setting, not this extension.

## Native MCP namespaces

This separate OMP setting keeps MCP method schemas out of the upfront tool list. The extension does not change it or replace native Eval. See the [namespace verification](https://github.com/juhas96/omp-codemode/blob/main/docs/pdd/mcp-namespaces.md) and the [finder measurements](https://github.com/juhas96/omp-codemode/blob/main/docs/pdd/mcp-find.md).

```sh
omp config get mcp.evalNamespaces
omp config set mcp.evalNamespaces true  # enable for new sessions
omp config reset mcp.evalNamespaces    # restore the default (false)
```

## Local install and checks

For local development, link the entry point instead of installing the package, then start a new OMP process:

```sh
mkdir -p "$HOME/.omp/agent/extensions"
ln -s "$PWD/mcp-find.js" "$HOME/.omp/agent/extensions/mcp-find.js"
```

To uninstall, remove the `mcp-find.js` symlink. Run `node --test test/mcp-find.test.mjs` for the OMP integration checks.
