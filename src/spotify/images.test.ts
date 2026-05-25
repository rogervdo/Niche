import { buildSrcSet, pickImageUrl } from './images'

describe('pickImageUrl', () => {
  const images = [
    { url: 'https://cdn/small.jpg', width: 64, height: 64 },
    { url: 'https://cdn/medium.jpg', width: 300, height: 300 },
    { url: 'https://cdn/large.jpg', width: 640, height: 640 },
  ]

  it('returns empty string when images are missing', () => {
    expect(pickImageUrl(null, 40)).toBe('')
    expect(pickImageUrl([], 40)).toBe('')
  })

  it('picks the smallest image at or above the target width', () => {
    expect(pickImageUrl(images, 40)).toBe('https://cdn/small.jpg')
    expect(pickImageUrl(images, 300)).toBe('https://cdn/medium.jpg')
    expect(pickImageUrl(images, 500)).toBe('https://cdn/large.jpg')
  })

  it('falls back to the largest image when target exceeds all widths', () => {
    expect(pickImageUrl(images, 2000)).toBe('https://cdn/large.jpg')
  })
})

describe('buildSrcSet', () => {
  it('builds a sorted srcset string', () => {
    const images = [
      { url: 'https://cdn/large.jpg', width: 640 },
      { url: 'https://cdn/small.jpg', width: 64 },
    ]
    expect(buildSrcSet(images)).toBe(
      'https://cdn/small.jpg 64w, https://cdn/large.jpg 640w'
    )
  })

  it('returns empty string when no sized images exist', () => {
    expect(buildSrcSet([{ url: 'https://cdn/x.jpg' }])).toBe('')
  })
})
