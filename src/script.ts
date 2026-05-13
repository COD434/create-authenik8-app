
import { cpSync }  from 'fs';

cpSync('./templates', 'dist/templates', {
  recursive: true,
  filter: (src) => !src.endsWith('.ts')
});
