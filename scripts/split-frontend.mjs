import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';

const base = path.resolve('apps/web/src');
const source = fs.readFileSync(path.join(base, 'components/ui.tsx'), 'utf8');
const tree = ts.createSourceFile('ui.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = tree.statements.filter(ts.isImportDeclaration).map(n => n.getText(tree)).join('\n').replaceAll('"../types"', '"../../types"').replaceAll('"../i18n"', '"../../i18n"');
const groups = {
 'badges/index': ['statusLabels','priorityLabels','statusLabel','priorityLabel','StatusBadge','PriorityBadge','RiskBadge','RiskProgressBar'],
 'cards/MetricCard': ['TrendIndicator','MetricCard'],
 'feedback/index': ['LoadingState','ErrorState','EmptyState'],
 'layout/index': ['PageHeader','Pagination'],
 'overlays/ActionMenu': ['ActionMenu'],
 'forms/index': ['SortDropdown','FileUploadArea'],
 'utils/formatters': ['formatDate','formatFullDate','formatRelative'],
 'layout/Avatar': ['Avatar']
};
let barrel = '';
for (const [file, names] of Object.entries(groups)) {
 const statements = tree.statements.filter(n => names.includes(n.name?.text || n.declarationList?.declarations[0]?.name?.text));
 if (statements.length !== names.length) throw new Error(`Missing declaration in ${file}`);
 const target = path.join(base, 'components', file + '.tsx');
 fs.mkdirSync(path.dirname(target), { recursive: true });
 fs.writeFileSync(target, imports + '\n\n' + statements.map(n => n.getText(tree)).join('\n\n') + '\n');
 barrel += `export * from "./${file}";\n`;
}
fs.writeFileSync(path.join(base, 'components/ui.tsx'), barrel);

const css = fs.readFileSync(path.join(base, 'styles.css'), 'utf8');
const parsed = postcss.parse(css);
const blocks = [];
let current = { name: 'base', text: '' };
for (const node of parsed.nodes) {
 if (node.type === 'comment' && current.text.length > 1500) {
  blocks.push(current);
  current = { name: node.text.replace(/[^a-zA-Z0-9 ]/g,'').trim().toLowerCase().replace(/\s+/g,'-').slice(0,60) || 'components', text: '' };
 }
 current.text += node.toString() + '\n\n';
}
blocks.push(current);
const styles = path.join(base,'styles');
fs.mkdirSync(styles,{recursive:true});
let cssImports = '';
blocks.forEach((block,i) => {
 const file = `${String(i).padStart(2,'0')}-${block.name}.css`;
 fs.writeFileSync(path.join(styles,file),block.text);
 cssImports += `@import "./${file}";\n`;
});
fs.writeFileSync(path.join(styles,'index.css'),cssImports);
fs.writeFileSync(path.join(base,'styles.css'),'@import "./styles/index.css";\n');
console.log(`Extracted ${Object.keys(groups).length} component modules and ${blocks.length} CSS sections in original cascade order.`);
