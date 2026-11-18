import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {MASCOT_THEMES} from '@/theme/mascot-themes'

function luminance(hex:string) {
  const rgb=hex.slice(1).match(/../g)!.map(channel=>{
    const value=parseInt(channel,16)/255
    return value<=.04045?value/12.92:((value+.055)/1.055)**2.4
  })
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
}
function contrast(a:string,b:string) {
  const pair=[luminance(a),luminance(b)].sort((x,y)=>y-x)
  return (pair[0]+.05)/(pair[1]+.05)
}
it('keeps action text readable for all mascot themes without hover darkening',()=>{
  for(const theme of Object.values(MASCOT_THEMES)) expect(contrast(theme.accent,theme.onAccent),theme.id).toBeGreaterThanOrEqual(4.5)
  expect(readFileSync('src/theme/refinement.css','utf8')).toContain('.ui-button:enabled:hover { filter:none;')
})
it('uses a consistent light foreground on colored primary actions',()=>{
  for(const theme of Object.values(MASCOT_THEMES)) expect(theme.onAccent,theme.id).toBe('#FFFFFF')
})
it('distinguishes editable fields from their light surfaces',()=>{
  const css=readFileSync('src/theme/tokens.css','utf8')
  const border=css.match(/--border-control:\s*(#[\da-fA-F]+)/)![1]
  for(const background of ['#FFFFFF','#FAF7F0','#F7F3EA']) expect(contrast(border,background)).toBeGreaterThanOrEqual(3)
})
it('keeps financial amounts readable on the warm page canvas',()=>{
  const css=readFileSync('src/theme/tokens.css','utf8')
  const token=(name:string)=>css.match(new RegExp(`${name}:\\s*(#[\\da-fA-F]+)`))![1]
  for(const name of ['--expense','--st-danger','--income']) {
    expect(contrast(token(name),token('--bg-app')),name).toBeGreaterThanOrEqual(4.5)
  }
  for(const theme of Object.values(MASCOT_THEMES)) {
    expect(contrast(theme.navText,theme.navBg),theme.id).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme.navAccent,'#241D18'),theme.id).toBeGreaterThanOrEqual(4.5)
  }
})
