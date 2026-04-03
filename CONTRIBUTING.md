## Contributing to create-authenik8-app


Thanks for your interest in contributing to Authenik8.

This project is a CLI tool that generates production-ready authentication scaffolding for Node.js applications.

---
## Getting Started

1. Fork the repository

Click the Fork button on GitLab and clone your fork:
```
git clone git@gitlab.com:your-username/create-authenik8-app.git
cd create-authenik8-app
```
2. Install dependencies
```
npm install
```
3. Run locally
```
npm run dev
```
---
## Project Structure

- "src/bin" - CLI entry point and prompts
- "./templates" - Project scaffolds (Express, Auth, etc.)
- "src/utils" - Helper utilities
---
## Contribution Guidelines

- Keep changes focused and minimal
- Follow existing code structure and naming conventions
- Avoid introducing breaking changes without discussion
- Ensure CLI prompts remain clear and user-friendly
---
## Adding Features

If you're adding a new feature:

 1. Create a new branch
   ```
 git checkout -b     feature/your-feature-name
    ```
  
2. Implement changes

3. Test locally using:
```
npm run dev
```
4. Commit with a clear message

5. Push and open a merge request

---
## Reporting Issues

Use GitLab Issues to report bugs or request features.

Include:

 - Steps to reproduce
 - Expected behavior
 - Actual behavior
 - Environment details

---
## Code Style

- Use TypeScript where applicable
- Prefer small reusable functions
- Keep CLI output clean and readable

---
## Security

If you discover a security vulnerability, do not open a public issue. Contact the maintainer directly.

---
## License
By contributing, you agree that your contributions will be licensed under the same license as the project.