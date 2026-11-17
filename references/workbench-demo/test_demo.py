"""Browser interaction checks. Storage uses a test double because the execution
browser blocks file/loopback navigation; this does not test real file:// storage."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, time
ROOT=Path(__file__).parent
HTML=(ROOT/'index.html').read_text()
results=[]
errors=[]

def record(name):
    results.append({'name':name,'status':'passed'})
    print('PASS',name,flush=True)

def make_page(browser, storage=None, viewport=None):
    page=browser.new_page(viewport=viewport or {'width':1440,'height':960},device_scale_factor=1)
    page.set_default_timeout(4500)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.evaluate('''seed=>{const data={...seed};window.__storage=data;
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>Object.hasOwn(data,k)?data[k]:null,
        setItem:(k,v)=>{data[k]=String(v)},removeItem:k=>{delete data[k]},clear:()=>{Object.keys(data).forEach(k=>delete data[k])}
      }});}''',storage or {})
    page.set_content(HTML,wait_until='load')
    return page

def snap(page):return page.evaluate('workbenchDemo.snapshot()')
def close_modal(page):page.locator('#modalRoot [data-action="close-modal"]').first.click()
def pane_id(page,name):return page.locator(f'.pane[aria-label="{name}"]').first.get_attribute('data-pane')
def pane_menu(page,pid):page.locator(f'[data-action="pane-menu"][data-id="{pid}"]').click()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=make_page(browser)
    assert page.locator('.pane').count()==4
    assert page.locator('#workspaceNav button').count()==3
    assert not errors
    record('01 Initial render: 3 workspaces / 4 panes / no runtime errors')
    page.screenshot(path=str(ROOT/'preview-light.png'))
    page.locator('#themeButton').click()
    expect(page.locator('body')).to_have_class('dark')
    page.screenshot(path=str(ROOT/'preview-dark.png'))
    page.locator('#themeButton').click()
    record('02 Theme switching')
    # Workspace switching and shared notes.
    page.locator('[data-action="switch-workspace"]').nth(1).click()
    expect(page.locator('#workspaceName')).to_have_text('研究与项目')
    page.locator('[data-note]').fill('测试笔记：<script>不得执行</script>')
    page.locator('[data-action="switch-workspace"]').nth(0).click()
    page.locator('[data-action="switch-workspace"]').nth(1).click()
    expect(page.locator('[data-note]')).to_have_value('测试笔记：<script>不得执行</script>')
    record('03 Workspace switching / editable notes retained')
    page.locator('[data-action="switch-workspace"]').nth(0).click()
    # Add, edit and complete a task.
    inp=page.locator('.todo-add input').first
    inp.fill('交互回归测试');inp.press('Enter')
    tid=next(t['id'] for t in snap(page)['tasks'] if t['title']=='交互回归测试')
    page.locator(f'[data-action="edit-task"][data-id="{tid}"]').click()
    page.locator('#taskTitle').fill('交互测试已编辑')
    page.locator('#taskGroup').fill('个人工作台')
    page.locator('[form="taskForm"]').click()
    page.locator(f'[data-action="toggle-task"][data-id="{tid}"]').click()
    assert next(t for t in snap(page)['tasks'] if t['id']==tid)['done']
    page.locator('[data-action="task-filter"][data-value="done"]').click()
    expect(page.locator(f'[data-action="toggle-task"][data-id="{tid}"]')).to_have_attribute('aria-checked','true')
    page.locator('[data-action="task-filter"][data-value="all"]').click()
    record('04 Todo add/edit/complete/filter')
    # Calendar edit and time validation.
    page.locator('[data-action="edit-event"][data-id="e3"]').click()
    page.locator('#eventTitle').fill('原型交互评审')
    page.locator('#eventEnd').fill('08:00')
    page.locator('[form="eventForm"]').click()
    expect(page.locator('#eventError')).to_contain_text('结束时间必须晚于')
    page.locator('#eventEnd').fill('11:00')
    page.locator('[form="eventForm"]').click()
    assert next(e for e in snap(page)['events'] if e['id']=='e3')['title']=='原型交互评审'
    page.locator('[data-action="calendar-mode"][data-value="month"]').click()
    assert page.locator('.month-cell').count()==42
    page.locator('[data-action="new-event-date"][data-date="2026-11-18"]').click()
    page.locator('#eventTitle').fill('新增事件')
    page.locator('[form="eventForm"]').click()
    assert any(e['title']=='新增事件' for e in snap(page)['events'])
    page.locator('[data-action="calendar-mode"][data-value="agenda"]').click()
    expect(page.locator('.agenda-item').filter(has_text='新增事件')).to_be_visible()
    page.locator('[data-action="calendar-mode"][data-value="week"]').click()
    record('05 Calendar edit / invalid time / month / agenda / new event')
    # Resize with pointer.
    splitter=page.locator('#workspaceCanvas > .layout-node > .splitter')
    old=page.evaluate('workbenchDemo.layout().ratio')
    box=splitter.bounding_box();page.mouse.move(box['x']+5,box['y']+100);page.mouse.down();page.mouse.move(box['x']-70,box['y']+100,steps=6);page.mouse.up()
    new=page.evaluate('workbenchDemo.layout().ratio');assert abs(old-new)>.025
    page.locator('#undoButton').click()
    assert abs(page.evaluate('workbenchDemo.layout().ratio')-old)<.001
    record('06 Pointer resize and undo')
    # Split and replace with notes, maximize/restore.
    cal=pane_id(page,'日程');pane_menu(page,cal);page.locator('[data-action="split-x"]').click()
    page.locator('[data-action="pick-view"][data-plugin="notes"]').click()
    assert page.locator('.pane').count()==5
    note=pane_id(page,'随手记')
    page.locator(f'[data-action="maximize"][data-id="{note}"]').click()
    assert page.locator('.pane').count()==1
    page.keyboard.press('Escape');assert page.locator('.pane').count()==5
    pane_menu(page,note);page.locator('[data-action="split-y"]').click()
    page.locator('[data-action="pick-view"][data-plugin="tasks"]').click()
    assert page.locator('.pane').count()==6
    assert page.locator('.pane[aria-label="待办事项"]').count()==2
    record('07 Horizontal/vertical split / multiple instances / maximize')
    # Two todo views share records but independent filters.
    taskpanes=page.locator('.pane[aria-label="待办事项"]')
    taskpanes.nth(0).locator('[data-action="task-filter"][data-value="done"]').click()
    expect(taskpanes.nth(0).locator(f'[data-action="toggle-task"][data-id="{tid}"]')).to_be_visible()
    assert taskpanes.nth(1).locator(f'[data-action="toggle-task"][data-id="{tid}"]').count()==0
    taskpanes.nth(0).locator(f'[data-action="toggle-task"][data-id="{tid}"]').click()
    assert taskpanes.nth(0).locator(f'[data-action="toggle-task"][data-id="{tid}"]').count()==0
    assert taskpanes.nth(1).locator(f'[data-action="toggle-task"][data-id="{tid}"]').count()==1
    record('08 Shared todo data with independent view filters')
    # Reorder by menu and real drag.
    before=page.locator('.pane').evaluate_all('(a)=>a.map(x=>x.dataset.pane)')
    pane_menu(page,before[0]);page.locator('[data-action="swap-pane"]').click()
    after=page.locator('.pane').evaluate_all('(a)=>a.map(x=>x.dataset.pane)')
    assert after[:2]==[before[1],before[0]]
    page.locator(f'[data-drag-pane="{after[0]}"]').drag_to(page.locator(f'.pane[data-pane="{after[1]}"] .pane-header'))
    swapped=page.locator('.pane').evaluate_all('(a)=>a.map(x=>x.dataset.pane)')
    assert swapped[:2]==before[:2]
    record('09 Pane menu swap and drag/drop swap')
    # Plugin disabled preserves configuration and data.
    events_before=copy_events=snap(page)['events']
    page.locator('#pluginsNav').click()
    page.locator('[data-action="toggle-plugin"][data-plugin="calendar"]').click()
    close_modal(page)
    expect(page.locator('.pane[aria-label="日程"]')).to_contain_text('插件已停用')
    page.locator('[data-action="enable-plugin"][data-plugin="calendar"]').click()
    assert snap(page)['events']==events_before
    record('10 Plugin disable / placeholder / enable without data loss')
    # Duplicate workspace with all new instance IDs, business data unchanged.
    old_state=snap(page);orig=next(w for w in old_state['workspaces'] if w['id']==old_state['active'])
    page.locator('#workspaceMenuButton').click();page.locator('[data-action="duplicate-workspace"]').click()
    new_state=snap(page)
    assert len(new_state['workspaces'])==4 and new_state['tasks']==old_state['tasks']
    def ids(n):return [] if n is None else [n['id']]+([] if n['type']=='leaf' else ids(n['a'])+ids(n['b']))
    dup=next(w for w in new_state['workspaces'] if w['id']==new_state['active'])
    assert set(ids(orig['tree'])).isdisjoint(ids(dup['tree']))
    record('11 Workspace duplicate: fresh IDs, shared data')
    page.locator('#workspaceMenuButton').click();page.locator('[data-action="delete-workspace"]').click();page.locator('[data-action="confirm-delete-workspace"]').click()
    assert len(snap(page)['workspaces'])==3 and snap(page)['tasks']==old_state['tasks']
    record('12 Delete workspace retains business data')
    # New blank workspace and close last pane.
    page.locator('#sideAdd').click();page.locator('#workspaceInput').fill('空白验收');page.locator('[form="workspaceForm"]').click()
    expect(page.locator('.workspace-empty')).to_be_visible()
    page.locator('#addViewButton').click();page.locator('[data-action="pick-view"][data-plugin="notes"]').click()
    lone=pane_id(page,'随手记');pane_menu(page,lone);page.locator('[data-action="close-pane"]').click()
    expect(page.locator('.workspace-empty')).to_be_visible()
    page.locator('#undoButton').click();assert page.locator('.pane').count()==1
    record('13 Empty workspace add/close final pane/undo')
    # Command palette and rename.
    page.keyboard.press('Control+k');page.locator('#commandInput').fill('切换到 资料处理');page.locator('#commandInput').press('Enter')
    expect(page.locator('#workspaceName')).to_have_text('资料处理')
    record('14 Command palette keyboard search/execute')
    # Jobs across view closing and workspace switching.
    tools=pane_id(page,'本地工具')
    page.locator(f'[data-action="start-job"][data-id="{tools}"]').click()
    job=snap(page)['jobs'][0]
    pane_menu(page,tools);page.locator('[data-action="close-pane"]').click()
    page.locator('[data-action="switch-workspace"]').nth(0).click()
    page.locator('#jobsNav').click()
    expect(page.locator('.job-card').first).to_contain_text('运行中')
    page.wait_for_function("workbenchDemo.snapshot().jobs[0].status === 'succeeded'",timeout=18000)
    expect(page.locator('.job-card').first).to_contain_text('已完成')
    page.locator('.job-card [data-action="show-result"]').first.click()
    expect(page.locator('.result-text')).to_contain_text('模拟转写结果')
    before_res=len(snap(page)['resources'])
    page.locator('[data-action="archive-result"]').click()
    assert len(snap(page)['resources'])==before_res+1
    page.locator('[data-action="archive-result"]').click()
    assert len(snap(page)['resources'])==before_res+1
    record('15 Job continues after view closes and workspace changes; result archive idempotent')
    close_modal(page);page.locator('.drawer [data-action="close-drawer"]').click()
    # Cancellation.
    tools=pane_id(page,'本地工具');page.locator(f'[data-action="start-job"][data-id="{tools}"]').click();page.locator('#jobsNav').click();page.locator('[data-action="cancel-job"]').first.click()
    assert snap(page)['jobs'][0]['status']=='cancelled'
    page.locator('.drawer [data-action="close-drawer"]').click()
    record('16 Job cancellation')
    # Invalid web schemes are rejected.
    page.locator('[data-action="new-resource"]').first.click()
    page.locator('#resourceTitle').fill('恶意 URL 测试');page.locator('#resourceKind').select_option('web');page.locator('#resourcePath').fill('javascript:alert(1)')
    page.locator('[form="resourceForm"]').click();expect(page.locator('#resourceError')).to_contain_text('http:// 或 https://');close_modal(page)
    record('17 Resource links reject javascript: URL')
    # Export/import layout roundtrip; no business data exported.
    page.locator('#workspaceMenuButton').click()
    with page.expect_download() as download_info:page.locator('[data-action="export-workspaces"]').click()
    out=ROOT/'test-layout-export.json';download_info.value.save_as(out)
    exported=json.loads(out.read_text());assert 'tasks' not in exported and 'events' not in exported
    nw=len(snap(page)['workspaces'])
    page.locator('#importInput').set_input_files(str(out))
    page.wait_for_function(f'workbenchDemo.snapshot().workspaces.length === {nw*2}')
    record('18 Layout export/import appends without copying business data')
    # Corrupt input rejected without mutation.
    bad=ROOT/'invalid-layout.json';bad.write_text('{"format":"workbench-demo-layout","version":1,"workspaces":[]}')
    n_before=len(snap(page)['workspaces']);page.locator('#importInput').set_input_files(str(bad));page.wait_for_timeout(200)
    assert len(snap(page)['workspaces'])==n_before
    record('19 Invalid layout rejected, existing workspaces retained')
    # Boot/restore through a localStorage-compatible test double.
    page.locator('[data-action="switch-workspace"]').nth(0).click()
    tools=pane_id(page,'本地工具');page.locator(f'[data-action="start-job"][data-id="{tools}"]').click()
    page.wait_for_timeout(300)
    old_snapshot=snap(page);store=page.evaluate('window.__storage');page.close()
    page=make_page(browser,store)
    restored=snap(page);assert restored['active']==old_snapshot['active'];assert restored['tasks']==old_snapshot['tasks'];assert restored['events']==old_snapshot['events']
    assert restored['jobs'][0]['status']=='interrupted'
    record('20 Save/restore serialization; unfinished jobs become interrupted (storage test double)')
    # No network/resource dependencies in generated app.
    assert page.locator('script[src], link[rel="stylesheet"], iframe').count()==0
    record('21 Self-contained page has no external script/style/frame dependency')
    # Narrow viewport still gives scrollable desktop canvas.
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(ROOT/'preview-narrow.png'))
    assert page.locator('#workspaceScroll').evaluate('(e)=>e.scrollWidth>e.clientWidth')
    page.locator('#helpButton').click();expect(page.locator('.modal')).to_be_visible();close_modal(page)
    record('22 Narrow viewport scroll and modal access')
    # Final clean previews.
    page.close();page=make_page(browser)
    page.wait_for_timeout(250)
    page.screenshot(path=str(ROOT/'preview-light.png'))
    page.locator('#themeButton').click();page.wait_for_timeout(300);page.screenshot(path=str(ROOT/'preview-dark.png'))
    page.locator('#themeButton').click();page.wait_for_timeout(300);page.locator('#addViewButton').click();page.wait_for_timeout(200);page.screenshot(path=str(ROOT/'preview-plugins.png'));close_modal(page)
    page.locator('[data-action="switch-workspace"]').nth(1).click();page.screenshot(path=str(ROOT/'preview-research.png'))
    assert not errors,errors
    record('23 No uncaught JavaScript errors across tested interactions')
    browser.close()
ROOT.joinpath('test-results.json').write_text(json.dumps({'passed':len(results),'results':results,'runtime_errors':errors,'environment':'Chromium via Playwright, direct HTML injection; localStorage test double, no public hosting','notes':['Actual file:// localStorage persistence was not exercised because execution browser blocks file and loopback navigation.','Screenshots use a localStorage-compatible test fixture; no private user data or account access.']},ensure_ascii=False,indent=2))
print('TOTAL',len(results),'PASSED')
