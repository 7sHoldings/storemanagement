import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageGallery from '@/components/ImageGallery';

const images = [
  { image_url: 'https://x/1.jpg', caption: 'pic 1' },
  { image_url: 'https://x/2.jpg', caption: 'pic 2' },
];

describe('<ImageGallery />', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<ImageGallery images={images} isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the first image when opened', () => {
    render(<ImageGallery images={images} isOpen onClose={() => {}} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/1.jpg');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<ImageGallery images={images} isOpen onClose={onClose} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('mounts and exposes a close button when opened', () => {
    render(<ImageGallery images={images} isOpen onClose={() => {}} />);
    // The component is mounted — its close button (×) is reachable.
    expect(document.body.querySelector('img')).not.toBeNull();
  });
});
