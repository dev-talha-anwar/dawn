if (!customElements.get('products-grid')) {
  customElements.define(
    'products-grid',
    class extends HTMLElement {
      connectedCallback() {
        this.dialog = this.querySelector('.products-grid__dialog');
        this.dialogBody = this.querySelector('.products-grid__dialog-body');
        this.dialog.addEventListener('close', this.handleClose);
        this.addEventListener('click', this.handleClick);
        this.addEventListener('change', this.handleChange);
        this.addEventListener('submit', this.handleSubmit);
      }

      async renderProduct(requestedUrl) {
        const url = new URL(requestedUrl, location.origin);
        url.searchParams.set('section_id', 'products-grid');

        this.productRequest?.abort();
        this.productRequest = new AbortController();

        try {
          const response = await fetch(url, { signal: this.productRequest.signal });
          if (!response.ok) throw new Error('Unable to load this product.');

          const html = new DOMParser().parseFromString(await response.text(), 'text/html');
          const product = html.querySelector('.products-grid__product');
          if (!product) throw new Error('Unable to load this product.');
          this.dialogBody.replaceChildren(product);
        } catch (error) {
          if (error.name !== 'AbortError') this.dialogBody.textContent = error.message;
        }
      }

      handleClose = () => {
        this.productRequest?.abort();
        this.productRequest = null;
        this.productUrl = null;
        this.dialogBody.replaceChildren();
      };

      handleClick = (event) => {
        const trigger = event.target.closest('[data-product-url]');
        if (trigger) {
          this.productUrl = trigger.dataset.productUrl;
          this.dialog.showModal();
          this.renderProduct(this.productUrl);
          return;
        }

        if (event.target === this.dialog || event.target.closest('.products-grid__close')) {
          this.dialog.close();
          return;
        }

        const option = event.target.closest('[data-option-value]');
        if (!option) return;

        const select = option.closest('.products-grid__option').querySelector('[data-option-select]');
        select.value = option.dataset.optionValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };

      handleChange = (event) => {
        if (!event.target.matches('[data-option-select]')) return;

        const url = new URL(this.productUrl, location.origin);
        const values = [...this.querySelectorAll('[data-option-select]')].map((select) => select.value);
        url.searchParams.set('option_values', values.join(','));
        this.renderProduct(url);
      };

      handleSubmit = async (event) => {
        const form = event.target.closest('.products-grid__form');
        if (!form) return;
        event.preventDefault();

        const normalize = (value = '') => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const options = [...form.querySelectorAll('[data-option-select]')].map((select) => ({
          name: normalize(select.dataset.optionName),
          value: normalize(select.options[select.selectedIndex]?.text),
        }));
        const color = options.find(({ name }) => name === 'color' || name === 'colour')?.value;
        const size = options.find(({ name }) => name === 'size')?.value;
        const selectedVariantId = Number(form.querySelector('[data-variant-id]').value);
        const addOnId = Number(this.dataset.addOnVariantId);
        const items = [{ id: selectedVariantId, quantity: 1 }];
        if (color === 'black' && (size === 'm' || size === 'medium') && addOnId) {
          items.push({ id: addOnId, quantity: 1 });
        }

        const button = form.querySelector('[type="submit"]');
        const error = form.querySelector('[data-product-error]');
        const cart = document.querySelector('cart-notification, cart-drawer');
        button.disabled = true;
        error.hidden = true;

        try {
          const body = { items };
          if (cart) {
            body.sections = cart.getSectionsToRender().map(({ id }) => id);
            body.sections_url = location.pathname;
            cart.setActiveElement(document.activeElement);
          }

          const response = await fetch(window.routes?.cart_add_url || '/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.description || 'Unable to add products.');

          if (!cart) {
            location.assign(window.routes?.cart_url || '/cart');
            return;
          }

          const selectedItem = result.items?.find(({ id }) => Number(id) === selectedVariantId) || result.items?.[0];
          const cartState = { ...result, ...selectedItem, sections: result.sections };
          this.dialog.close();
          cart.classList.remove('is-empty');
          cart.renderContents(cartState);

          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
            publish(PUB_SUB_EVENTS.cartUpdate, {
              source: 'products-grid',
              productVariantId: selectedVariantId,
              cartData: cartState,
            });
          }
        } catch (requestError) {
          error.textContent = requestError.message;
          error.hidden = false;
        } finally {
          button.disabled = false;
        }
      };
    },
  );
}