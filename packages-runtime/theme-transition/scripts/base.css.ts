export default {
  '::view-transition-old(root),\n  ::view-transition-new(root)': {
    mixBlendMode: 'normal',
    animation: 'none',
  },
  '::view-transition-old(root)': {
    zIndex: 1,
  },
  '::view-transition-new(root)': {
    zIndex: 2147483646,
  },
  '.dark::view-transition-old(root)': {
    zIndex: 2147483646,
  },
  '.dark::view-transition-new(root)': {
    zIndex: 1,
  },
  '[data-theme-transition="to-dark"]::view-transition-old(root)': {
    zIndex: 1,
  },
  '[data-theme-transition="to-dark"]::view-transition-new(root)': {
    zIndex: 2147483646,
  },
  '[data-theme-transition="to-dark"]:not([data-theme-transition-preset])::view-transition-new(root),\n[data-theme-transition="to-dark"][data-theme-transition-preset="circle"]::view-transition-new(root)': {
    clipPath: 'circle(0px at var(--theme-transition-x) var(--theme-transition-y))',
  },
  '[data-theme-transition="from-dark"]::view-transition-old(root)': {
    zIndex: 2147483646,
  },
  '[data-theme-transition="from-dark"]:not([data-theme-transition-preset])::view-transition-old(root),\n[data-theme-transition="from-dark"][data-theme-transition-preset="circle"]::view-transition-old(root)': {
    clipPath: 'circle(var(--theme-transition-radius) at var(--theme-transition-x) var(--theme-transition-y))',
  },
  '[data-theme-transition="from-dark"]::view-transition-new(root)': {
    zIndex: 1,
  },
  '[data-theme-transition="to-dark"][data-theme-transition-preset="fade"]::view-transition-new(root)': {
    opacity: '0',
  },
  '[data-theme-transition="from-dark"][data-theme-transition-preset="fade"]::view-transition-old(root)': {
    opacity: '1',
  },
  '[data-theme-transition="to-dark"][data-theme-transition-preset="wipe"]::view-transition-new(root)': {
    clipPath: 'inset(0 0 0 100%)',
  },
  '[data-theme-transition="from-dark"][data-theme-transition-preset="wipe"]::view-transition-old(root)': {
    clipPath: 'inset(0 0 0 0)',
  },
  '[data-theme-transition="to-dark"][data-theme-transition-preset="slide"]::view-transition-new(root)': {
    opacity: '0',
    transform: 'translate3d(16px, 0, 0)',
  },
  '[data-theme-transition="from-dark"][data-theme-transition-preset="slide"]::view-transition-old(root)': {
    opacity: '1',
    transform: 'translate3d(0, 0, 0)',
  },
}
