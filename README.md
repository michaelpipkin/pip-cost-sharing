# PipSplit

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 13.2.6.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

This project uses Playwright for end-to-end testing with Firebase emulator integration. The testing setup supports two environments:

### Local Development Environment (with hCaptcha)
- Uses `local.dev.com:4200` for hCaptcha compatibility
- Requires adding `127.0.0.1 local.dev.com` to your hosts file
- Run tests: `pnpm e2e` or `pnpm e2e:local`
- Run with UI: `pnpm e2e:headed` or `pnpm e2e:local:headed`

### CI/CD Environment
- Uses `localhost:4200`
- Automatically starts Angular dev server
- Run tests: `pnpm e2e:ci`
- Run with UI: `pnpm e2e:ci:headed`

### Other Testing Commands
- `pnpm e2e:debug` - Run tests in debug mode
- `pnpm e2e:ui` - Run tests in Playwright UI mode
- `pnpm e2e:report` - View test reports
- `pnpm e2e:install` - Install Playwright browsers

### Firebase Emulator Integration
Tests automatically start and configure Firebase emulators. For tests requiring authentication, use the `firebasePage` fixture which includes Firebase emulator configuration.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
