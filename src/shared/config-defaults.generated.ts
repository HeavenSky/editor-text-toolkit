// 由 scripts/gen-config-defaults.mjs 从 package.json 生成, 提交入库; 不要手改.
// 修改 package.json 的配置后运行 npm run gen:config 再 npm run check.

/** contributes.configuration 各顶层配置键的 schema default, 与 package.json 逐字相等. */
export const CONFIG_DEFAULTS: Readonly<Record<string, unknown>> = {
	"commonFormatter.list": [],
	"textToolkit.copyPath.pathStyle": "absolute",
	"textToolkit.copyPath.separator": ":",
	"textToolkit.copyPath.multiLineFormat": "range",
	"textToolkit.copyPath.useLineCountSyntax": false,
	"textToolkit.changeCase.includeDotInCurrentWord": false,
	"textToolkit.alignByRegex.templates": {},
	"textToolkit.alignByRegex.rememberLastInput": true,
	"textToolkit.plainText.promptSizeMB": 2,
	"textToolkit.plainText.autoApplyExtensions": [],
	"textToolkit.plainText.applyEditorSettings": true,
	"textToolkit.plainText.disableLineNumbers": false,
	"textToolkit.plainText.suppressLanguageActivation": true,
	"textToolkit.plainText.editorOverrides": {
		"editor.minimap.enabled": false,
		"editor.wordWrap": "on",
		"editor.folding": false,
		"editor.stickyScroll.enabled": false,
		"editor.bracketPairColorization.enabled": false,
		"editor.guides.indentation": false,
		"editor.guides.bracketPairs": false,
		"editor.matchBrackets": "never",
		"editor.occurrencesHighlight": "off",
		"editor.selectionHighlight": false,
		"editor.renderWhitespace": "none",
		"editor.renderControlCharacters": false,
		"editor.codeLens": false,
		"editor.colorDecorators": false,
		"editor.links": false,
		"editor.hover.enabled": false,
		"editor.parameterHints.enabled": false,
		"editor.suggestOnTriggerCharacters": false,
		"editor.wordBasedSuggestions": "off",
		"editor.quickSuggestions": {
			"other": false,
			"comments": false,
			"strings": false,
		},
		"editor.formatOnType": false,
		"editor.formatOnPaste": false,
		"editor.autoClosingBrackets": "never",
		"editor.autoClosingQuotes": "never",
		"editor.trimAutoWhitespace": false,
		"editor.semanticHighlighting.enabled": false,
		"editor.unicodeHighlight.nonBasicASCII": false,
		"editor.unicodeHighlight.invisibleCharacters": false,
		"editor.unicodeHighlight.ambiguousCharacters": false,
	},
	"textToolkit.terminalOpen.selectionLink": false,
	"textToolkit.diff.normalizationRules": [],
	"textToolkit.diff.contextMenu": "both",
	"textToolkit.diff.clipboardSide": "left",
	"textToolkit.advanced": {}
};

/** commonFormatter.list 数组元素各字段的 schema default. */
export const COMMON_FORMATTER_ITEM_DEFAULTS: Readonly<Record<string, unknown>> = {
	"enabled": true,
	"args": [],
	"cwd": "${fileDirname}",
	"env": {},
	"timeout": 5000
};
