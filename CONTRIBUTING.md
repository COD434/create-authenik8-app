## Contributing to create-authenik8-app


Thanks for your interest in contributing to Authenik8.

This project is a CLI tool that generates production-ready authentication scaffolding for Node.js applications, with a focus on reliability, developer experience, and scalable architecture.

---
 ## Contribution Philosophy

Authenik8 is an evolving system with a strong focus on architecture consistency and developer experience.

To avoid unnecessary complexity:

•Contributions should be small, focused, and aligned with existing patterns

•Core architecture decisions are maintained by the project owner

•New features should be discussed before implementation

---
## Good First Contributions

If you're new to the project, start here:

• CLI improvements (UX, prompts, error handling)

• Fixing edge cases (especially setup/resume logic)
• Documentation improvements

• Logging and output clarity

• Small utility enhancements

---
## What to Avoid (for now)

To maintain consistency, please avoid:

• Large architectural changes

• Rewriting core authentication logic

• Introducing new frameworks or major dependencies

• Significant changes without prior discussion

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

• Keep changes minimal and focused

• Follow existing naming and structure

• Ensure CLI output remains clean and readable

• Prefer small reusable functions

• Avoid breaking changes unless discussed

---
## Testing Changes

Before opening a pull request, run the relevant test command from [TESTING.md](./TESTING.md). For template or CLI-flow changes, prefer focused tests that use temporary directories and stubs instead of real external services.

---
## Adding Features

If you're adding a new feature:

 1. Create a new branch
   
 git checkout -b     feature/your-feature-name
    
  
2. Implement changes

3. Test locally using:

npm run dev

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
