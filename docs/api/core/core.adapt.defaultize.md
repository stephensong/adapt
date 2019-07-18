---
id: core.adapt.defaultize
title: Adapt.Defaultize type
hide_title: true
---
<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[API Reference](../index.md) &gt; [Adapt Core](./index.md) &gt; [@adpt/core](./core.md) &gt; [Adapt](./core.adapt.md) &gt; [Defaultize](./core.adapt.defaultize.md)

## Adapt.Defaultize type

<b>Signature:</b>

```typescript
export declare type Defaultize<Props, Defaults> = {
    [K in Extract<keyof Props, keyof Defaults>]?: Props[K];
} & {
    [K in Exclude<RequiredPropertiesT<Props>, keyof Defaults>]: Props[K];
} & {
    [K in Exclude<OptionalPropertiesT<Props>, keyof Defaults>]?: Props[K];
};
```