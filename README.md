# Default to named export Transformer

`export default` is considered harmful. See https://humanwhocodes.com/blog/2019/01/stop-using-default-exports-javascript-module/ for some reasoning.

Uses [jscondeshift](https://github.com/facebook/jscodeshift) to transform "export default" to named exports.

# Example Usage

```
npx jscodeshift --extensions=jsx,js --transform defaultToNamedExport.ts ../scrivito_example_app_js/src/**/*.js
```

Please see the warnings and infos of the script!
