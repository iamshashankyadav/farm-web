import { editDistance, suggest } from './suggest'

const VOCAB = ['Apple', 'Banana', 'Tomato', 'Tomato, Desi', 'Potato', 'Pineapple', 'Mango', 'Green Peas', 'Carrot']
const texts = (q: string) => suggest(q, VOCAB).map((s) => s.text)

describe('suggest', () => {
  it('finds words by their start, best first', () => {
    expect(texts('app')[0]).toBe('Apple')
    expect(texts('tom')).toEqual(['Tomato', 'Tomato, Desi'])
  })
  it('finds "apple" from the letters "apl" (skipped letters)', () => {
    expect(texts('apl')).toContain('Apple')
    expect(texts('apl')[0]).toBe('Apple')
  })
  it('matches a later word and the middle of a word', () => {
    expect(texts('desi')).toContain('Tomato, Desi')
    expect(texts('ato')).toEqual(expect.arrayContaining(['Tomato', 'Potato']))
  })
  it('forgives a typo', () => {
    expect(texts('tomatto')).toContain('Tomato')
    expect(texts('bananna')).toContain('Banana')
  })
  it('ignores case, accents and punctuation', () => {
    expect(texts('  MAN')).toEqual(['Mango'])
  })
  it('needs two letters, hides the exact word, and returns nothing for nonsense', () => {
    expect(texts('a')).toEqual([])
    expect(texts('mango')).not.toContain('Mango')
    expect(texts('zzzq')).toEqual([])
  })
  it('keeps at most the limit', () => {
    expect(suggest('a', ['aa', 'ab'], 1)).toEqual([])
    expect(suggest('ap', ['apple', 'apricot', 'apex'], 2)).toHaveLength(2)
  })
})

describe('editDistance', () => {
  it('counts single edits and gives up beyond the limit', () => {
    expect(editDistance('tomato', 'tomatto')).toBe(1)
    expect(editDistance('abc', 'xyzxyz')).toBeGreaterThan(2)
  })
})
