---
name: mcp-management
description: Configure and troubleshoot MCP integrations safely in the local coding environment.
---

# MCP Management Skill

## Purpose
Configure and troubleshoot MCP (Model Context Protocol) integrations for filesystem, browser, and documentation access in the DaliTak project.

## When to use
- Before using MCP tools for file operations or browser automation
- When MCP servers are disconnected or failing
- When configuring new MCP integrations

## Procedures

### 1. Inspect existing MCP configuration
- Check VS Code settings for MCP server configurations
- Check `.vscode/mcp.json` or equivalent MCP config files
- Verify which MCP servers are installed and configured

### 2. Confirm installed client and transport format
- Cline supports MCP via stdio or HTTP transport
- Filesystem MCP: restricted to authorized project directories
- Browser MCP (Playwright): requires local browser installation
- Documentation MCP: requires configured documentation sources

### 3. Prefer trusted packages and official documentation
- Use official MCP servers from modelcontextprotocol.io
- Verify package authenticity before installation
- Check for known vulnerabilities in MCP dependencies

### 4. Restrict filesystem access
- Filesystem MCP should only access `c:\Users\Aryan\OneDrive\Desktop\Task management and seduling app\`
- Never grant access to home directory, system directories, or other projects
- Use read-only access where write is not needed

### 5. Keep credentials secure
- Environment variables in `.env` files, never committed
- `.env.example` is safe to commit (no real secrets)
- Never log or expose JWT secrets, database URIs, or API keys

### 6. Avoid broad auto-approval
- Review each shell command before execution
- Review each file edit before applying
- Avoid `npm install -g` or global modifications without user approval
- Ask before destructive operations (delete, overwrite, etc.)

### 7. Verify server startup and tool availability
- Check MCP server logs for startup errors
- Verify exposed tools match expected capabilities
- Test a simple operation before complex workflows

### 8. Diagnose common issues
- Missing executables: check PATH and installation
- Path errors: use absolute paths, verify directory exists
- Permission errors: check file ownership and access rights
- Timeouts: increase timeout or check server responsiveness

### 9. Never claim connection without verification
- Test MCP server with a simple operation before relying on it
- Check connection status in VS Code MCP panel
- Report disconnected servers and available alternatives

### 10. Document setup and limitations
- Record MCP server names, versions, and configurations
- Document restart instructions for each server
- List available tools and their parameters
- Note any known limitations or workarounds
