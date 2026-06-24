# Repository Guidelines

## Project Structure & Module Organization

This repository is a monorepo. Import the root directory into IntelliJ as the Gradle project.

- `backend/`: Spring Boot Java service. Main code is in `backend/src/main/java/com/seamarg/backend`; tests are in `backend/src/test/java/com/seamarg/backend`.
- `frontend/`: TypeScript/Vite web app. Source lives in `frontend/src`; production output goes to `frontend/dist`.
- `lambda/`: TypeScript AWS Lambda workspace. Source is in `lambda/src`; compiled output goes to `lambda/dist`.
- `infra/terraform/`: Terraform infrastructure. The active environment stack lives in `infra/terraform/environments/dev`; reusable modules live in `infra/terraform/modules`.
- `.github/workflows/`: CI and manually triggered deployment workflows.

For project history, deployed resource names, security decisions, and known deployment lessons, read `docs/project-context.md` before making infrastructure, security, or pipeline changes.

## Build, Test, and Development Commands

- `./gradlew :backend:bootRun`: run the backend locally on port `8080`.
- `./gradlew :backend:test`: run backend unit/context tests.
- `./gradlew :backend:bootJar`: build `backend/build/libs/seamarg-backend.jar`.
- `npm install`: install root workspace dependencies.
- `npm run build`: build all TypeScript workspaces.
- `npm run dev -w frontend`: run the frontend Vite dev server.
- `terraform fmt -recursive infra/terraform`: format Terraform.
- `terraform -chdir=infra/terraform/environments/dev validate`: validate the dev stack after `terraform init`.

## Coding Style & Naming Conventions

Use the existing `.editorconfig`: spaces with 2-space indentation by default, tabs for Java and Gradle. Java packages stay under `com.seamarg.backend`. Use descriptive controller/service/test names such as `HelloWorldController` and `HelloWorldControllerTests`. TypeScript should remain strict and module-oriented.

## Testing Guidelines

Backend tests use JUnit through Gradle. Add tests under the matching package in `backend/src/test/java`. Prefer focused unit tests for simple classes and Spring context tests only when framework wiring matters. Run `./gradlew :backend:test` before pushing backend changes. For TypeScript, run `npm run build` to typecheck and compile workspaces.

## Commit & Pull Request Guidelines

The current history uses short messages such as `Initial commit` and `testing deployment`. Prefer concise imperative commits, for example `Add backend health endpoint` or `Wire EC2 backend deployment`. Pull requests should describe the change, list verification commands, call out Terraform/AWS impacts, and include screenshots only for visible frontend changes.

## Security & Configuration Tips

Do not commit `.env`, Terraform state, AWS credentials, kubeconfigs, or generated build outputs. GitHub Actions deploys through OIDC using `AWS_ROLE_TO_ASSUME`; keep AWS account values in GitHub Environment variables. Treat `terraform apply` and the `Deploy` workflow as production-impacting actions.
