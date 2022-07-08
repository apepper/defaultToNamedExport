# Default to named export Transformer

Uses [jscondeshift](https://github.com/facebook/jscodeshift) to transform "export default" to named exports.

# Example Usage

```
npx jscodeshift --extensions=jsx,js --transform defaultToNamedExport.ts ../scrivito_example_app_js/src/**/*.js
```

Please see the warnings and infos of the script!
