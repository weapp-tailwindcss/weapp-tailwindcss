export const classContextEdgeCases = [
  'const x = { className: "pages\\u002fhome" }',
  'const x = { className: "pages\\x2fhome" }',
  'const x = { "\\x63lass": "pages/home" }',
  'const x = { "c-l-a-s-s": "pages/home" }',
  'const x = { "c_l:a_s-s": "pages/home" }',
  'const x = { [`cl\\u0061ss`]: "pages/home" }',
  'const x = { [`c_l:a_s-s`]: "pages/home" }',
  'const x = helper["TW-Merge"]("pages/home")',
  'const x = helper["t_w:m-e_r_g_e"]("pages/home")',
  'const x = r/*comment*/("pages/home")',
  'const x = c\\u006e("pages/home")',
  'const x = helper["\\x63n"]("pages/home")',
]
