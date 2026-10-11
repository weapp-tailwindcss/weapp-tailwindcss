import type postcss from "postcss";
import { MappingChars2String } from "@weapp-tailwindcss/escape";
import {
  createInjectPreflight,
  createStyleHandler,
} from "@weapp-tailwindcss/postcss";
import { getCompilerContext } from "@/context";
import { normalizeEol } from "../helpers/normalizeEol";
import { createGetCase, cssCasePath } from "../util";

const getCase = createGetCase(cssCasePath);
// @ts-ignore

// const putCase = createPutCase(cssCasePath)
const styleHandler = createStyleHandler();
export function cssUnescape(str: string) {
  return str.replaceAll(/\\([\dA-F]{1,6}[\t\n\f\r ]?|[\s\S])/gi, (match) => {
    return match.length > 2
      ? String.fromCodePoint(Number.parseInt(match.slice(1).trim(), 16))
      : match[1];
  });
}
describe("styleHandler", () => {
  it("css @media case", async () => {
    const opt = getCompilerContext({
      customReplaceDictionary: MappingChars2String,
    });
    const cssInjectPreflight = createInjectPreflight(opt.cssPreflight);
    const testCase = await getCase("media1.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight,
      cssPreflightRange: opt.cssPreflightRange,
      cssSelectorReplacement: opt.cssSelectorReplacement,
    });
    // const expected = await getCase('media1.result.css')
    // await putCase('media1.result.css', result)
    // expect(result).toBe(expected)
    expect(css).toMatchSnapshot();
  });

  it("css @media hover case 0", async () => {
    const { styleHandler } = getCompilerContext();
    const { css } = await styleHandler(
      `@media (hover: hover) {
      a {
        color: white;
        background: black;
      }
    }`,
      {
        isMainChunk: true,
      },
    );
    expect(css).toMatchSnapshot();
  });

  it("css @media hover case 1", async () => {
    const { styleHandler } = getCompilerContext();
    const { css } = await styleHandler(
      `@media (hover: hover) {
      a:hover {
        color: white;
        background: black;
      }
    }`,
      {
        isMainChunk: true,
      },
    );
    expect(css).toMatchSnapshot();
  });

  // it('main chunk remove empty var', async () => {
  //   const testCase = await getCase('taro.dev.css')
  //   const { css } = await styleHandler(testCase, {
  //     isMainChunk: true
  //   })
  //   const expected = await getCase('taro.dev.result.css')
  //   // await putCase('taro.dev.result.css', result)
  //   // expect(true).toBe(true)
  //   expect(result).toBe(expected)
  // })

  it("main chunk build error", async () => {
    const opt = getCompilerContext({
      customReplaceDictionary: MappingChars2String,
    });
    const cssInjectPreflight = createInjectPreflight(opt.cssPreflight);
    const testCase = await getCase("taro.build.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight,
      cssPreflightRange: opt.cssPreflightRange,
      cssSelectorReplacement: opt.cssSelectorReplacement,
    });
    // const expected = await getCase('taro.build.result.css')
    // await putCase('taro.build.result.css', result)
    // expect(true).toBe(true)
    // expect(result).toBe(expected)
    expect(css).toMatchSnapshot();
  });

  it("before,after content case", async () => {
    const testCase = await getCase("after-content.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],
      cssPreflightRange: "all",
      cssSelectorReplacement: {
        universal: "view",
      },
      escapeMap: MappingChars2String,
    });
    expect(css).toMatchSnapshot();
  });

  it("tailwindcss v2 jit should append view selector", async () => {
    const testCase = "::before,::after{--tw-border-opacity: 1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: "view",
      },
      escapeMap: MappingChars2String,
    });
    expect(css).toMatchSnapshot();
  });

  it("keeps Tailwind content init scoped to pseudo elements after universal replacement", async () => {
    const testCase = "*,::before,::after{--tw-content: '';}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],
      cssSelectorReplacement: {
        universal: ["view", "text"],
      },
      escapeMap: MappingChars2String,
    });

    expect(css).toBe("view,text,::before,::after{--tw-content: '';}");
  });

  it("cssPreflightRange option view", async () => {
    const testCase = "::before,::after{--tw-border-opacity: 1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: "view",
      },
      escapeMap: MappingChars2String,
    });
    expect(css).toMatchSnapshot();
  });

  it("cssPreflightRange option all", async () => {
    const testCase = "::before,::after{--tw-border-opacity: 1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],
      cssPreflightRange: "all",
      cssSelectorReplacement: {
        universal: "view",
      },
      escapeMap: MappingChars2String,
    });
    expect(css).toMatchSnapshot();
  });

  it("should pseudo element", async () => {
    const testCase = '.after\\:content-\\[\\"\\*\\"\\]::after{}';
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: "view",
      },
      escapeMap: MappingChars2String,
    });
    expect(css).toBe(".after_ccontent-_b_q_x_q_B::after{}");
  });

  it("escapes UnoCSS numeric unit selectors for miniprogram class names", async () => {
    const testCase =
      ".p-10\\%{padding:10%}.p-2\\.5px{padding:2.5px}.m-4rem{margin:4rem}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: false,
      escapeMap: MappingChars2String,
    });

    expect(css).toBe(
      ".p-10_v{padding:10%}.p-2_d5px{padding:2.5px}.m-4rem{margin:4rem}",
    );
  });

  it("should pseudo element new case", async () => {
    const testCase = '.after\\:content-\\[\\"\\*\\"\\]::after{color:red;}';
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: "view",
      },
    });
    expect(css).toBe(".after_ccontent-_b_q_x_q_B::after{color:red;}");
  });

  it("should * be replace as view etc", async () => {
    const testCase = ".aspect-w-16 > *,.a>.b{aspect-ratio:1/1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: "view",
      },
      escapeMap: MappingChars2String,
    });
    expect(css).toBe(".aspect-w-16>view,.a>.b{aspect-ratio:1/1;}");
  });

  it("replaceUniversalSelectorWith option should * be replace as any string", async () => {
    const testCase = ".aspect-w-16 > *,.a>.b{aspect-ratio:1/1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: ".happy",
      },

      escapeMap: MappingChars2String,
    });
    expect(css).toBe(".aspect-w-16>.happy,.a>.b{aspect-ratio:1/1;}");
  });

  it("set replaceUniversalSelectorWith option to be false", async () => {
    const testCase = ".aspect-w-16 > *,.a>.b{aspect-ratio:1/1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(css).toBe(".a>.b{aspect-ratio:1/1;}");
  });

  it("set replaceUniversalSelectorWith option and cssSelectorReplacement case 0", async () => {
    const { styleHandler } = getCompilerContext();
    const testCase = ".aspect-w-16 > *,.a>.b{aspect-ratio:1/1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssSelectorReplacement: {
        universal: "view",
      },
    });
    expect(css).toBe(".aspect-w-16>view,.a>.b{aspect-ratio:1/1;}");
  });

  it("set replaceUniversalSelectorWith option and cssSelectorReplacement case 1", async () => {
    const { styleHandler } = getCompilerContext();
    const testCase = ".aspect-w-16 > *,.a>.b{aspect-ratio:1/1;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,

      cssSelectorReplacement: {
        universal: false,
      },
    });
    expect(css).toBe(".a>.b{aspect-ratio:1/1;}");
  });

  it(":hover should be remove", async () => {
    const testCase = ".a:hover{color:black;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
      cssRemoveHoverPseudoClass: true,
    });
    expect(css).toBe("");
  });

  it("mutiple selectors :hover should be remove only", async () => {
    const testCase = ".a:hover,.b{color:black;}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
      cssRemoveHoverPseudoClass: true,
    });
    expect(css).toBe(".b{color:black;}");
  });

  it("arbitrary values case 0", async () => {
    const testCase = await getCase("arbitrary-variants-0.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("arbitrary values case 1", async () => {
    const testCase = await getCase("arbitrary-variants-1.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
      cssRemoveHoverPseudoClass: true,
    });
    expect(normalizeEol(css)).toBe("\n");
  });

  it("arbitrary values case 2", async () => {
    const testCase = await getCase("arbitrary-variants-2.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("arbitrary values case 3", async () => {
    const testCase = await getCase("arbitrary-variants-3.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("arbitrary values case 4", async () => {
    const testCase = await getCase("arbitrary-variants-4.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("arbitrary values case 5", async () => {
    const testCase = await getCase("arbitrary-variants-5.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("arbitrary values case 6", async () => {
    const testCase = await getCase("arbitrary-variants-6.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("global variables scope matched case", async () => {
    const testCase = ":before,:after{--tw-:'test'}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("global variables scope matched and inject", async () => {
    const opt = getCompilerContext();
    const cssInjectPreflight = createInjectPreflight(opt.cssPreflight);
    const testCase = ":before,:after{--tw-:'test'}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight,

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toBe("::before,::after{--tw-:'test'}");
  });

  it("global variables scope matched and inject with isMainChunk false", async () => {
    const opt = getCompilerContext();
    const cssInjectPreflight = createInjectPreflight(opt.cssPreflight);
    const testCase = ":before,:after{--tw-:'test'}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: false,
      cssInjectPreflight,

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toBe("::before,::after{--tw-:'test'}");
  });

  it("global variables scope matched and inject and modify preflight range", async () => {
    const opt = getCompilerContext();
    const cssInjectPreflight = createInjectPreflight(opt.cssPreflight);
    const testCase = ":before,:after{--tw-:'test'}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight,
      cssPreflightRange: "all",
      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toBe("::before,::after{--tw-:'test'}");
  });

  it("global variables scope matched and inject and modify preflight range with isMainChunk false", async () => {
    const opt = getCompilerContext();
    const cssInjectPreflight = createInjectPreflight(opt.cssPreflight);
    const testCase = ":before,:after{--tw-:'test'}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: false,
      cssInjectPreflight,
      cssPreflightRange: "all",
      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toBe("::before,::after{--tw-:'test'}");
  });

  it("global variables scope not matched", async () => {
    const testCase = ":before,:after{color:red}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toBe('::before,::after{color:red}');
  });

  it("before:content-['+']", async () => {
    const testCase =
      ".before\\:content-\\[\\'\\+\\'\\]::before {\n    --tw-content: '+';\n    content: var(--tw-content)\n}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("@apply space-y/x css selector", async () => {
    const testCase = ".test > :not([hidden]) ~ :not([hidden]){}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toBe(".test>view+view{}");
  });

  it("is Pseudo Class", async () => {
    const testCase = ":is(.dark .dark:bg-zinc-800) {}";
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toBe(".dark .dark:bg-zinc-800 {}");
  });

  it("utf8 charset", async () => {
    const testCase = await getCase("utf8.css");
    const { css } = await styleHandler(testCase, {
      isMainChunk: true,
      cssInjectPreflight: () => [],

      cssSelectorReplacement: {
        universal: false,
      },
      escapeMap: MappingChars2String,
    });
    expect(normalizeEol(css)).toMatchSnapshot();
  });

  it("cssUnescape case 0", () => {
    expect(cssUnescape("\\31 2345")).toBe("12345");
  });

  it("cssUnescape case 1", () => {
    expect(cssUnescape("\\32xlctext-base")).toBe("2xlctext-base");
  });

  it("injectAdditionalCssVarScope option true", async () => {
    const { styleHandler } = getCompilerContext({
      injectAdditionalCssVarScope: true,
    });
    const rawSource = await getCase("backdrop.css");
    const { css } = await styleHandler(rawSource, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("injectAdditionalCssVarScope option true and replace universal", async () => {
    const { styleHandler } = getCompilerContext({
      injectAdditionalCssVarScope: true,
      cssSelectorReplacement: {
        universal: ["view", "text", "button"],
      },
    });
    const rawSource = await getCase("backdrop.css");
    const { css } = await styleHandler(rawSource, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("injectAdditionalCssVarScope option true isMainChunk false", async () => {
    const { styleHandler } = getCompilerContext({
      injectAdditionalCssVarScope: true,
    });
    const rawSource = await getCase("backdrop.css");
    const { css } = await styleHandler(rawSource, { isMainChunk: false });
    expect(css).toMatchSnapshot();
  });

  it(":root pseudo case 0", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:root{}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: false });
    expect(css).toBe("page,.tw-root,wx-root-portal-content{}");
  });

  it(":root pseudo case 0 invert", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:root{}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: false,
      cssSelectorReplacement: {
        root: false,
      },
    });
    expect(css).toBe(rawCode);
  });

  it(":root pseudo case 1", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:root,[data-theme]{}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: false });
    expect(css).toBe("page,.tw-root,wx-root-portal-content,[data-theme]{}");
  });

  it(":root pseudo case 1 invert", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:root,[data-theme]{}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: false,
      cssSelectorReplacement: {
        root: false,
      },
    });
    expect(css).toBe(rawCode);
  });

  it(":host pseudo should be preserved", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:host{color:yellow;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: false });
    expect(css).toBe(rawCode);
  });

  it("combinator selector case 0", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `.space-x-4>:not([hidden])~:not([hidden]){}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssChildCombinatorReplaceValue: ["view"],
    });
    expect(css).toBe(".space-x-4>view+view{}");
  });

  it("combinator selector case 1", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `.divide-x>:not([hidden])~:not([hidden]){}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssChildCombinatorReplaceValue: ["view"],
    });
    expect(css).toBe(".divide-x>view+view{}");
  });

  it("combinator selector case 2", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `.divide-blue-200>:not([hidden])~:not([hidden]){}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssChildCombinatorReplaceValue: ["view"],
    });
    expect(css).toBe(".divide-blue-200>view+view{}");
  });

  it("combinator selector case 3", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:is(.dark .dark:divide-slate-700)>:not([hidden])~:not([hidden]){}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssChildCombinatorReplaceValue: ["view"],
    });
    expect(css).toBe(".dark .dark:divide-slate-700>view+view{}");
  });

  it("combinator selector case 4", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `.divide-dashed>:not([hidden])~:not([hidden]){}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssChildCombinatorReplaceValue: ["view"],
    });
    expect(css).toBe(".divide-dashed>view+view{}");
  });

  it("comment case 0", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `/* #ifdef MP-WEIXIN */\n.divide-dashed>:not([hidden])~:not([hidden]){}\n/* #endif */`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssChildCombinatorReplaceValue: ["view"],
    });
    expect(css).toBe(
      "/* #ifdef MP-WEIXIN */\n.divide-dashed>view+view{}\n/* #endif */",
    );
  });

  it("is-pseudo-class case 0", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:is(view,text),:after.:before{color:red;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toBe("view,text,::after.::before{color:red;}");
  });

  it("is-pseudo-class case 1", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:is(view,text),::before,::after,view,text{color:red;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toBe("::before,::after,view,text{color:red;}");
  });

  it("is-pseudo-class case 2", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:is(.aa,bb,view,text),::before,::after{color:red;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toBe(
      ".aa,bb:not(.weapp-tw-ig),view:not(.weapp-tw-ig),text:not(.weapp-tw-ig),::before,::after{color:red;}",
    );
  });

  it("use with weapp-pandacss case 0 ", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `:is(view,text),view,text,::before,::after{--tw-border-opacity: 1;--tw-border-opacity: 1;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("use with weapp-pandacss case 1 ", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `*,:is(view,text),view,text,::before,::after{--tw-border-opacity: 1;--tw-border-opacity: 1;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("use with weapp-pandacss case 2 ", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `*,:is(view,text),::before,::after{--tw-border-opacity: 1;--tw-border-opacity: 1;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("use with weapp-pandacss case 2.1 ", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `*,view,text,::before,::after{--tw-border-opacity: 1;--tw-border-opacity: 1;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("use with weapp-pandacss case 3 ", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `*,view,text,:is(view,text),:is(view,text),::before,::after,*{--tw-border-opacity: 1;--tw-border-opacity: 1;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("use with weapp-pandacss case 4 ", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `.space-y-4>:not([hidden])+:not([hidden]){--tw-border-opacity: 1;--tw-border-opacity: 1;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it(".steps @icestack/ui case 0", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `.steps .step-primary+.step-primary:before,.steps .step-primary:after {
      --tw-bg-opacity: 1;
      background-color: rgba(var(--ice-primary) / var(--tw-bg-opacity));
      --tw-text-opacity: 1;
      color: rgba(var(--ice-primary-content) / var(--tw-text-opacity));
    }`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("guess css var scoped", async () => {
    const { styleHandler } = getCompilerContext();
    const rawCode = `*, ::before, ::after {
      --tw-border-spacing-x: 0;
      --tw-border-spacing-y: 0;
      --tw-translate-x: 0;
      --tw-translate-y: 0;
      --tw-rotate: 0;
      --tw-skew-x: 0;
      --tw-skew-y: 0;
      --tw-scale-x: 1;
      --tw-scale-y: 1;
      --tw-pan-x:  ;
      --tw-pan-y:  ;
      --tw-pinch-zoom:  ;
      --tw-scroll-snap-strictness: proximity;
      --tw-gradient-from-position:  ;
      --tw-gradient-via-position:  ;
      --tw-gradient-to-position:  ;
      --tw-ordinal:  ;
      --tw-slashed-zero:  ;
      --tw-numeric-figure:  ;
      --tw-numeric-spacing:  ;
      --tw-numeric-fraction:  ;
      --tw-ring-inset:  ;
      --tw-ring-offset-width: 0px;
      --tw-ring-offset-color: #fff;
      --tw-ring-color: rgb(59 130 246 / 0.5);
      --tw-ring-offset-shadow: 0 0 #0000;
      --tw-ring-shadow: 0 0 #0000;
      --tw-shadow: 0 0 #0000;
      --tw-shadow-colored: 0 0 #0000;
      --tw-blur:  ;
      --tw-brightness:  ;
      --tw-contrast:  ;
      --tw-grayscale:  ;
      --tw-hue-rotate:  ;
      --tw-invert:  ;
      --tw-saturate:  ;
      --tw-sepia:  ;
      --tw-drop-shadow:  ;
      --tw-backdrop-blur:  ;
      --tw-backdrop-brightness:  ;
      --tw-backdrop-contrast:  ;
      --tw-backdrop-grayscale:  ;
      --tw-backdrop-hue-rotate:  ;
      --tw-backdrop-invert:  ;
      --tw-backdrop-opacity:  ;
      --tw-backdrop-saturate:  ;
      --tw-backdrop-sepia:  
  }`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it("drops pseudo-element selectors for uni-app-x base compatibility while keeping variable init", async () => {
    const { styleHandler } = getCompilerContext({
      uniAppX: true,
    });
    const rawCode = `*, ::before, ::after {
      --tw-border-spacing-x: 0;
      --tw-border-spacing-y: 0;
      --tw-content: "";
    }
    ::backdrop {
      --tw-ring-offset-width: 0px;
    }
    .after\\:content-\\[\\"x\\"\\]::after {
      --tw-content: "x";
      content: var(--tw-content);
    }
    .border-\\[\\#999\\] {
      border-color: rgb(153 153 153 / 1);
    }`;

    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      uniAppX: true,
    });

    expect(css).not.toContain("::before");
    expect(css).not.toContain("::after");
    expect(css).not.toContain(":before");
    expect(css).not.toContain(":after");
    expect(css).not.toContain("::backdrop");
    expect(css).not.toContain("view,text {");
    expect(css).not.toContain("--tw-border-spacing-x: 0;");
    expect(css).toContain(".border-_b_h999_B");
  });

  it("add postcss plugins case 0", async () => {
    const tailwindcssPostcss = await import("@tailwindcss/postcss");

    const { styleHandler } = getCompilerContext({
      postcssOptions: {
        plugins: [
          tailwindcssPostcss.default({
            optimize: false,
          }) as postcss.Plugin,
        ],
      },
    });
    const rawCode = `@import "tailwindcss" source(none);
  `;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it(":hover remove case 0", async () => {
    const { styleHandler } = getCompilerContext({});
    const rawCode = `.a:hover{color:red;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it(":hover remove case 1", async () => {
    const { styleHandler } = getCompilerContext({});
    const rawCode = `.b,.a:hover{color:red;}`;
    const { css } = await styleHandler(rawCode, { isMainChunk: true });
    expect(css).toMatchSnapshot();
  });

  it(":hover remove case 0 revert", async () => {
    const { styleHandler } = getCompilerContext({});
    const rawCode = `.a:hover{color:red;}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssRemoveHoverPseudoClass: false,
    });
    expect(css).toMatchSnapshot();
  });

  it(":hover remove case 1 revert", async () => {
    const { styleHandler } = getCompilerContext({});
    const rawCode = `.b,.a:hover{color:red;}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssRemoveHoverPseudoClass: false,
    });
    expect(css).toMatchSnapshot();
  });

  it("https://github.com/tailwindlabs/tailwindcss/pull/14625/files", async () => {
    const { styleHandler } = getCompilerContext({});
    const rawCode = `[hidden]:where(:not([hidden="until-found"])) {
  display: none;
}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssRemoveHoverPseudoClass: false,
    });
    expect(css).toMatchSnapshot();
  });

  it("remove zero selector", async () => {
    const { styleHandler } = getCompilerContext({});
    const rawCode = `.b,.a:hover{color:red;} {color:red;} {color:red;}`;
    const { css } = await styleHandler(rawCode, {
      isMainChunk: true,
      cssRemoveHoverPseudoClass: false,
    });
    expect(css).toMatchSnapshot();
  });
});
