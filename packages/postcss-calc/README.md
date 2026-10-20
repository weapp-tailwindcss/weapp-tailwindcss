# @weapp-tailwindcss/postcss-calc

> English | [简体中文](./README.zh-CN.md)

This package processes CSS calc() expressions. It reduces expressions when they can be evaluated safely and preserves calc() when mixed units or uncertain values are involved.

`filterDeclaration?: (declaration: Declaration) => boolean` lets callers exclude declaration contexts such as registration descriptors. Returning `false` preserves that declaration; the default processes all declarations. This does not filter media-query or selector processing.

## Website

For setup guides, configuration references, and framework examples, see the [official weapp-tailwindcss documentation](https://tw.weapp.dev).
