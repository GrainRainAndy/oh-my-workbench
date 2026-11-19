import {edit} from './operations.mjs';
const main = document.querySelector('main');
let next = 1;
let root = {type:'leaf',paneId:'p0',viewInstanceId:'v0'};
let selected = root.paneId;
function render(node) {
  if (node.type === 'leaf') {
    const pane = document.createElement('button');
    pane.className = 'pane';
    pane.dataset.pane = node.paneId;
    pane.textContent = node.viewInstanceId ?? '空窗格';
    pane.setAttribute('aria-pressed', String(selected === node.paneId));
    pane.onclick = () => { selected = node.paneId; draw(); };
    return pane;
  }
  const group = document.createElement('div');
  group.className = 'split';
  const property = node.axis === 'horizontal' ? 'gridTemplateColumns' : 'gridTemplateRows';
  group.style[property] = node.ratio+'fr '+(1-node.ratio)+'fr';
  group.append(render(node.first), render(node.second));
  return group;
}
function draw() {
  const tree = render(root);
  tree.classList.add('tree');
  main.replaceChildren(tree);
  const active = main.querySelector('[aria-pressed=true]') ?? main.querySelector('button');
  selected = active.dataset.pane;
  active.setAttribute('aria-pressed','true');
  active.focus();
  document.querySelector('#ratio').disabled = root.type === 'leaf';
}
document.querySelector('header').onclick = event => {
  const action = event.target.dataset.action;
  if (!action) return;
  const panes = [...main.querySelectorAll('[data-pane]')].map(p=>p.dataset.pane);
  let command = {kind:action};
  if (action === 'swap') command.other = panes[(panes.indexOf(selected)+1)%panes.length];
  if (action === 'horizontal' || action === 'vertical') {
    command = {kind:'split',axis:action,leaf:{type:'leaf',paneId:'p'+next,viewInstanceId:'v'+next}};
    next++;
  }
  root = edit(root,selected,command);
  draw();
};
document.querySelector('#ratio').onchange = event => {
  root = edit(root,selected,{kind:'resize',ratio:Number(event.target.value)});
  draw();
};
draw();
