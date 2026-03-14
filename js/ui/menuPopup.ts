import makeDraggable from "./utils/draggable.js"
import {attachDialogCloseHandlerWithParent} from "./utils/ui-utils.js"
import * as DOMUtils from "./utils/dom-utils.js"
import {createCheckbox} from "../igv-icons.js"

interface MenuItem {
    name?: string
    element?: HTMLElement
    label?: string
    click?: (e: Event) => void
    dialog?: (e: Event) => void
    init?: () => void
    type?: string
    value?: any
    doAllMultiSelectedTracks?: boolean
    menuItemType?: string
}

interface MenuElement {
    el: HTMLElement
    init?: () => void
}

interface ParsedMenuItem {
    element: HTMLElement
    init?: () => void
}

interface PresentConfig {
    gearColumnPosition: string
}

class MenuPopup {

    popover: HTMLElement
    parent: HTMLElement
    popoverContent: HTMLElement

    constructor(parent: HTMLElement) {
        this.popover = DOMUtils.div({class: 'igv-menu-popup'})

        parent.appendChild(this.popover)
        this.parent = parent

        const header: HTMLElement = DOMUtils.div({class: 'igv-menu-popup-header'})
        this.popover.appendChild(header)

        attachDialogCloseHandlerWithParent(header, () => this.popover.style.display = 'none')

        this.popoverContent = DOMUtils.div()
        this.popover.appendChild(this.popoverContent)

        makeDraggable(this.popover, header)

        // absorb click to prevent it leaking through to parent DOM element
        header.addEventListener('click', (e: Event) => {
            e.stopPropagation()
            e.preventDefault()
        })

        this.popover.style.display = 'none'

    }

    presentMenuList(trackView: any, menuList: (string | MenuItem)[], config: PresentConfig): void {

        hideAllMenuPopups(this.parent);

        if (menuList.length > 0) {

            this.popoverContent.innerHTML = '';

            const parsedList: ParsedMenuItem[] = this.parseMenuList(trackView, menuList);

            for (let item of parsedList) {

                if (item.init) {
                    item.init();
                }

                if (0 === parsedList.indexOf(item)) {
                    item.element.classList.remove('igv-track-menu-border-top');
                }

                if (item.element.classList.contains('igv-track-menu-border-top') || item.element.classList.contains('igv-menu-popup-check-container')) {
                    // Do nothing
                } else if (item.element.tagName.toLowerCase() === 'div') {
                    item.element.classList.add('igv-menu-popup-shim');
                }

                this.popoverContent.appendChild(item.element)

            }

            // NOTE: style.display must NOT be 'none' when calculating width. A display = 'none' will always
            //       yield a width of zero (0).
            this.popover.style.display = 'flex';

            const { width } = this.popover.getBoundingClientRect();

            if('left' === config.gearColumnPosition) {
                this.popover.style.right = `${width}px`;
            } else {
                this.popover.style.left = `${-width}px`;
            }
            this.popover.style.top = `${0}px`;

        }
    }

    parseMenuList(trackView: any, menuList: (string | MenuItem)[]): ParsedMenuItem[] {

        return menuList.map((item: string | MenuItem, i: number): ParsedMenuItem => {

            let element: HTMLElement;

            // name and element fields checked for backward compatibility
            if (typeof item !== 'string' && item.name) {
                element = document.createElement('div');
                element.textContent = item.name;
            } else if (typeof item !== 'string' && item.element) {
                element = item.element;
            } else if (typeof item !== 'string' && typeof item.label === 'string') {
                element = document.createElement('div');
                element.innerHTML = item.label;
            } else if (typeof item === 'string') {

                if (item.startsWith("<")) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = item;
                    element = tempDiv.firstChild as HTMLElement;
                } else {
                    element = document.createElement('div');
                    element.textContent = item;
                }
            }

            if (0 === i) {
                element.classList.add('igv-track-menu-border-top');
            }

            if (typeof item !== 'string' && (item.click || item.dialog)) {

                const handleClick = (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if ((item as MenuItem).click) {

                        if (trackView.track.selected) {

                            const multiSelectedTrackViews = trackView.browser.getSelectedTrackViews();

                            if (true === (item as MenuItem).doAllMultiSelectedTracks) {
                                (item as MenuItem).click.call(trackView.track, e);
                            } else {

                                if ('removeTrack' === (item as MenuItem).menuItemType) {

                                    const callback = () => {

                                        trackView.browser.overlayTrackButton.setVisibility(false);

                                        for (const { track } of multiSelectedTrackViews) {
                                            (item as MenuItem).click.call(track, e);
                                        }
                                    };

                                    const count = multiSelectedTrackViews.length;

                                    const config =
                                        {
                                            html: `Are you sure you want to delete ${count} tracks?`,
                                            callback
                                        };

                                    trackView.browser.menuUtils.dialog.present(config, e);

                                } else {

                                    for (const { track } of multiSelectedTrackViews) {
                                        (item as MenuItem).click.call(track, e);
                                    }

                                }
                            }

                        } else {
                            (item as MenuItem).click.call(trackView.track, e);
                        }

                    } else if ((item as MenuItem).dialog) {
                        (item as MenuItem).dialog.call(trackView.track, e);
                    }

                    this.popover.style.display = 'none';
                };

                if (undefined === element) {
                    console.log('element is undefined')
                }

                element.addEventListener('click', handleClick);
                element.addEventListener('touchend', (e: Event) => handleClick(e));
                element.addEventListener('mouseup', function (e: Event) {
                    e.preventDefault();
                    e.stopPropagation();
                });

            }

            return {element, init: (typeof item !== 'string' ? item.init : undefined) || undefined};
        });

    }

    presentTrackContextMenu(e: MouseEvent, menuItems: (string | Node | MenuItem)[]): void {

        this.popoverContent.innerHTML = ''

        const menuElements: MenuElement[] = createMenuElements(menuItems, this.popover)
        for (let {el} of menuElements) {
            this.popoverContent.appendChild(el)
        }

        present(e, this.popover)

    }

    hide(): void {
        this.popover.style.display = 'none'
    }

    dispose(): void {

        this.popoverContent.innerHTML = ''
        this.popover.innerHTML = ''

        Object.keys(this).forEach((key: string) => {
            (this as any)[key] = undefined
        })
    }
}

function createMenuElements(itemList: (string | Node | MenuItem)[], popover: HTMLElement): MenuElement[] {

    return itemList.map((item: string | Node | MenuItem): MenuElement => {

        let el: HTMLElement

        if (typeof item === 'string' && '<hr/>' === item) {
            el = document.createElement('hr')
        } else if (typeof item === 'string') {
            el = DOMUtils.div({class: 'context-menu'})
            el.innerHTML = item
        } else if (item instanceof Node) {
            el = item as HTMLElement
        } else {
            if (typeof item.init === 'function') {
                item.init()
            }

            if ("checkbox" === item.type) {
                el = createCheckbox("Show all bases", item.value)
            }

            // TODO: I can't find any use of this and should probably be deleted - data
            // else if ("color" === item.type) {
            //
            //     const colorPicker = new GenericColorPicker(popover.parentElement)
            //     colorPicker.configure({color: 'grey'})
            //
            //     el = DOMUtils.div({class: 'context-menu'})
            //     if (typeof item.label === 'string') {
            //         el.innerHTML = item.label
            //     }
            //     const clickHandler = e => {
            //         colorPicker.show()
            //         DOMUtils.hide(popover)
            //         e.preventDefault()
            //         e.stopPropagation()
            //     }
            //     el.addEventListener('click', clickHandler)
            //     el.addEventListener('touchend', clickHandler)
            //     el.addEventListener('mouseup', function (e) {
            //         e.preventDefault()
            //         e.stopPropagation()
            //     })
            // }

            else {
                el = DOMUtils.div({class: 'context-menu'})
                if (typeof item.label === 'string') {
                    el.innerHTML = item.label
                }
            }

            if (item.click && "color" !== item.type) {
                el.addEventListener('click', handleClick)
                el.addEventListener('touchend', handleClick)
                el.addEventListener('mouseup', function (e: Event) {
                    e.preventDefault()
                    e.stopPropagation()
                })

                // eslint-disable-next-line no-inner-declarations
                function handleClick(e: Event): void {
                    (item as MenuItem).click(e)
                    DOMUtils.hide(popover)
                    e.preventDefault()
                    e.stopPropagation()
                }
            }
        }

        return {el, init: (item as MenuItem).init}
    })

}

function present(e: MouseEvent, popover: HTMLElement): void {

    // NOTE: style.display most NOT be 'none' when calculating width. a display = 'none' will always
    //       yield a width of zero (0).
    popover.style.display = 'flex'

    const {x, y} = DOMUtils.translateMouseCoordinates(e, popover.parentNode as HTMLElement)
    const {width} = popover.getBoundingClientRect()
    const xmax = x + width

    const {width: parentWidth} = (popover.parentNode as HTMLElement).getBoundingClientRect()

    popover.style.left = `${xmax > parentWidth ? (x - (xmax - parentWidth)) : x}px`
    popover.style.top = `${y}px`

}

const hideAllMenuPopups = (parent: HTMLElement): void => {

    const menus = parent.querySelectorAll('.igv-menu-popup')
    for (const menu of menus) {
        (menu as HTMLElement).style.display = 'none'
    }

}

export default MenuPopup
