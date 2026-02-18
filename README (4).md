# Puzzle Gift Experience

A premium, 5-stage puzzle game designed as a gift.

## 🎁 How to Use

1. **Add Images**:
    - Place 5 images in `assets/images/` named `stage_1.png` to `stage_5.png`.
    - Place 1 image named `reveal.png` for the final surprise.
    - *Note: If no images are provided, the game will generate beautiful gradient puzzles.*

2. **Customize Message**:
    - Open `index.html`.
    - Find the `#final-reveal` section.
    - Edit the `<h1>` and `<p>` tags to change the final birthday/celebration message.

3. **Run**:
    - Open `index.html` in any modern web browser.
    - Or use a local server (e.g., Live Server in VS Code) for best performance with images.

## 🛠️ Customization

- **Difficulty**: Edit `STAGE_CONFIG` in `script.js` to change grid sizes (e.g., change `rows: 3` to `rows: 6`).
- **Colors**: Edit `:root` variables in `style.css` to change the theme colors (Gold/Pink/Dark).

## 📱 Mobile Support

The game is fully responsive and supports touch events for dragging pieces on mobile devices.

## 🚀 Deployment

### GitHub Pages (Recommended)

1. Create a new repository on GitHub.
2. Upload `index.html`, `style.css`, `script.js`, and the `assets` folder.
3. Go to **Settings** > **Pages**.
4. Under **Source**, select `main` branch and `/root` folder.
5. Click **Save**. Your gift will be live at `https://your-username.github.io/repo-name/`.

### Netlify

1. Drag and drop your project folder onto [Netlify Drop](https://app.netlify.com/drop).
2. It will deploy instantly and give you a shareable link.
