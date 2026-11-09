/*
 * Grouped inset rows, the settings idiom the app uses elsewhere: the
 * Extension, Settings, Discord and Listen Together pages.
 */

const row = 'relative flex items-center justify-between px-4 py-[11px] type-title-3 hairline-[16px]';
const integration = 'relative grid items-center gap-x-3 px-4 py-[11px] type-title-3 hairline-[52px]';
const field = 'w-[220px] flex-none rounded-[8px] border-0 bg-quaternary px-2.5 py-[5px] type-body text-primary';

export const settingsUi = {
  /** The page title and its rows as one column, centred in the page. */
  centered: 'mx-auto max-w-[calc(640px+2*var(--body-gutter))]',
  body: 'mx-(--body-gutter) mt-5 mb-[120px] max-w-[640px]',
  group: 'overflow-hidden rounded-[10px] bg-quinary',
  sectionHeader: 'mx-4 mt-7 mb-2 type-subhead-emphasized uppercase text-secondary',
  footer: 'mx-4 mt-2 type-callout text-secondary',

  row,
  /** A row holding a switch, a select or a field: the whole row is its label. */
  controlRow: `${row} cursor-pointer gap-4`,
  rowText: 'flex flex-col gap-0.5',
  rowDetail: 'type-callout text-secondary',
  value: 'inline-flex items-center gap-1.5 text-right type-body-reduced text-secondary',
  dot: 'size-2 rounded-full bg-green',

  /** Download rows: browser logo, title and detail, chevron. */
  download:
    'relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-[11px] hover:bg-quinary hairline-[60px]',
  updateDot: 'size-2.5 justify-self-center rounded-full bg-key',
  downloadText: 'flex min-w-0 flex-col gap-0.5',
  downloadTitle: 'type-title-3-emphasized text-key',
  downloadDetail: 'type-body text-secondary',
  chevron: 'text-tertiary',
  steps: 'mx-4 mt-2.5 list-decimal ps-[18px] type-body-tall text-secondary [&>li+li]:mt-1',

  /** Integration rows: a coloured app-icon square, the name, the state. */
  integration: `${integration} grid-cols-[24px_minmax(0,1fr)_auto]`,
  /** An integration row without the icon square. */
  integrationPlain: `${integration} grid-cols-[minmax(0,1fr)_auto]`,
  integrationIcon: 'grid size-6 place-items-center rounded-[6px] text-white',
  integrationName: 'min-w-0',
  /** Settings: an integration row that opens a page of its own. */
  linkRow: 'w-full cursor-pointer text-start hover:bg-quaternary',
  /** A row's own action, after its status (Connect, Disconnect). */
  inlineButton: 'ml-2 rounded-[12px] bg-quaternary px-2.5 py-[3px] type-callout-emphasized text-primary disabled:opacity-50',
  inlineLink: 'text-key',

  switch: [
    'relative h-[22px] w-[38px] flex-none cursor-pointer appearance-none rounded-[11px] bg-quaternary transition-[background-color] duration-200 checked:bg-green',
    'after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgb(0_0_0/0.3)] after:transition-[translate] after:duration-200 checked:after:translate-x-4',
  ].join(' '),
  input: field,

  /** Search bar at top */
  searchContainer: 'relative flex items-center mb-5 w-full rounded-[10px] bg-quinary px-3 py-2 text-primary focus-within:ring-2 focus-within:ring-key/40 transition-all border border-[var(--searchBarBorderColor)]',
  searchInput: 'w-full bg-transparent pl-2 pr-6 text-[14px] leading-tight placeholder:text-secondary focus:outline-none type-body',
  searchClear: 'absolute right-2 p-1 text-secondary hover:text-primary cursor-pointer rounded-full hover:bg-quaternary transition-colors',

  /** Squircles: 30x30 rounded-[8px] glyph box */
  squircle: 'grid size-[30px] place-items-center rounded-[8px] text-white flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.12)]',

  /** Category navigation row */
  categoryRow: 'relative flex items-center justify-between w-full px-4 py-[11px] hover:bg-quaternary/50 cursor-pointer text-start transition-colors hairline-[56px]',
  categoryLeft: 'flex items-center gap-3.5 min-w-0',
  categoryTitle: 'type-title-3 font-medium text-primary truncate',
  categoryBadge: 'rounded-full bg-quaternary px-2 py-0.5 type-caption-2 font-medium text-secondary',
  categoryRight: 'flex items-center gap-1.5 text-tertiary flex-shrink-0 ml-3',

  /** Drill-down back navigation */
  backButton: 'inline-flex items-center gap-1.5 text-key type-body-emphasized mb-4 hover:opacity-80 transition-opacity cursor-pointer select-none',

  /** Segmented control (e.g. for Theme switcher) */
  segmentedControl: 'flex p-1 rounded-[10px] bg-quaternary/40 gap-1 w-full max-w-[320px]',
  segmentedButton: 'flex-1 py-1.5 px-3 rounded-[7px] text-center type-callout-emphasized transition-all duration-150 cursor-pointer select-none flex items-center justify-center gap-1.5',
  segmentedActive: 'bg-white dark:bg-[#636366] text-primary shadow-sm font-semibold',
  segmentedInactive: 'text-secondary hover:text-primary',
};
