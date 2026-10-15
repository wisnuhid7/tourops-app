import {
  DateFilterModule,
  ModuleRegistry,
  NumberFilterModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
} from "ag-grid-community";

ModuleRegistry.registerModules([TextFilterModule, NumberFilterModule, DateFilterModule]);
if (import.meta.env.DEV) {
  ModuleRegistry.registerModules([ValidationModule]);
}

export const agGridTheme = themeQuartz.withParams({
  fontFamily: "var(--font-sans)",
  accentColor: "hsl(var(--primary))",
  backgroundColor: "hsl(var(--background))",
  borderColor: "hsl(var(--border))",
  columnBorder: "1px solid hsl(var(--border))",
  rowBorder: "1px solid hsl(var(--border))",
  headerColumnBorder: "1px solid hsl(var(--border))",
  headerRowBorder: "1px solid hsl(var(--border))",
  wrapperBorder: "1px solid hsl(var(--border))",
  wrapperBorderRadius: 8,
  headerBackgroundColor: "hsl(var(--muted) / 0.45)",
  headerTextColor: "hsl(var(--muted-foreground))",
  inputBackgroundColor: "hsl(var(--background))",
  inputBorder: "1px solid hsl(var(--border))",
  inputBorderRadius: 6,
  inputFocusBackgroundColor: "hsl(var(--background))",
  inputFocusBorder: "1px solid hsl(var(--primary))",
  inputHeight: 28,
  inputPlaceholderTextColor: "hsl(var(--muted-foreground))",
  inputTextColor: "hsl(var(--foreground))",
  borderRadius: 8,
  headerHeight: 40,
  rowHeight: 40,
  fontSize: 14,
  dataFontSize: 14,
  headerFontWeight: 500,
});

export const agGridDefaultColDef: ColDef = {
  sortable: true,
  filter: true,
  resizable: true,
  suppressHeaderMenuButton: true,
};
