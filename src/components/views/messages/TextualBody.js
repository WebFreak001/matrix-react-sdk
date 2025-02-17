/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017 New Vector Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import highlight from 'highlight.js';
import * as HtmlUtils from '../../../HtmlUtils';
import {formatDate} from '../../../DateUtils';
import sdk from '../../../index';
import ScalarAuthClient from '../../../ScalarAuthClient';
import Modal from '../../../Modal';
import SdkConfig from '../../../SdkConfig';
import dis from '../../../dispatcher';
import { _t } from '../../../languageHandler';
import * as ContextualMenu from '../../structures/ContextualMenu';
import SettingsStore from "../../../settings/SettingsStore";
import ReplyThread from "../elements/ReplyThread";
import {host as matrixtoHost} from '../../../matrix-to';
import {pillifyLinks} from '../../../utils/pillify';

module.exports = React.createClass({
    displayName: 'TextualBody',

    propTypes: {
        /* the MatrixEvent to show */
        mxEvent: PropTypes.object.isRequired,

        /* a list of words to highlight */
        highlights: PropTypes.array,

        /* link URL for the highlights */
        highlightLink: PropTypes.string,

        /* should show URL previews for this event */
        showUrlPreview: PropTypes.bool,

        /* callback for when our widget has loaded */
        onHeightChanged: PropTypes.func,

        /* the shape of the tile, used */
        tileShape: PropTypes.string,
    },

    getInitialState: function() {
        return {
            // the URLs (if any) to be previewed with a LinkPreviewWidget
            // inside this TextualBody.
            links: [],

            // track whether the preview widget is hidden
            widgetHidden: false,
        };
    },

    copyToClipboard: function(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();

        let successful = false;
        try {
            successful = document.execCommand('copy');
        } catch (err) {
            console.log('Unable to copy');
        }

        document.body.removeChild(textArea);
        return successful;
    },

    componentDidMount: function() {
        this._unmounted = false;
        if (!this.props.editState) {
            this._applyFormatting();
        }
    },

    _applyFormatting() {
        // pillifyLinks BEFORE linkifyElement because plain room/user URLs in the composer
        // are still sent as plaintext URLs. If these are ever pillified in the composer,
        // we should be pillify them here by doing the linkifying BEFORE the pillifying.
        pillifyLinks(this.refs.content.children, this.props.mxEvent);
        HtmlUtils.linkifyElement(this.refs.content);
        this.calculateUrlPreview();

        if (this.props.mxEvent.getContent().format === "org.matrix.custom.html") {
            const blocks = ReactDOM.findDOMNode(this).getElementsByTagName("code");
            if (blocks.length > 0) {
                // Do this asynchronously: parsing code takes time and we don't
                // need to block the DOM update on it.
                setTimeout(() => {
                    if (this._unmounted) return;
                    for (let i = 0; i < blocks.length; i++) {
                        if (SettingsStore.getValue("enableSyntaxHighlightLanguageDetection")) {
                            highlight.highlightBlock(blocks[i]);
                        } else {
                            // Only syntax highlight if there's a class starting with language-
                            const classes = blocks[i].className.split(/\s+/).filter(function(cl) {
                                return cl.startsWith('language-');
                            });

                            if (classes.length != 0) {
                                highlight.highlightBlock(blocks[i]);
                            }
                        }
                    }
                }, 10);
            }
            this._addCodeCopyButton();
        }
    },

    componentDidUpdate: function(prevProps) {
        if (!this.props.editState) {
            const stoppedEditing = prevProps.editState && !this.props.editState;
            const messageWasEdited = prevProps.replacingEventId !== this.props.replacingEventId;
            if (messageWasEdited || stoppedEditing) {
                this._applyFormatting();
            }
        }
    },

    componentWillUnmount: function() {
        this._unmounted = true;
    },

    shouldComponentUpdate: function(nextProps, nextState) {
        //console.log("shouldComponentUpdate: ShowUrlPreview for %s is %s", this.props.mxEvent.getId(), this.props.showUrlPreview);

        // exploit that events are immutable :)
        return (nextProps.mxEvent.getId() !== this.props.mxEvent.getId() ||
                nextProps.highlights !== this.props.highlights ||
                nextProps.replacingEventId !== this.props.replacingEventId ||
                nextProps.highlightLink !== this.props.highlightLink ||
                nextProps.showUrlPreview !== this.props.showUrlPreview ||
                nextProps.editState !== this.props.editState ||
                nextState.links !== this.state.links ||
                nextState.editedMarkerHovered !== this.state.editedMarkerHovered ||
                nextState.widgetHidden !== this.state.widgetHidden);
    },

    calculateUrlPreview: function() {
        //console.log("calculateUrlPreview: ShowUrlPreview for %s is %s", this.props.mxEvent.getId(), this.props.showUrlPreview);

        if (this.props.showUrlPreview) {
            let links = this.findLinks(this.refs.content.children);
            if (links.length) {
                // de-dup the links (but preserve ordering)
                const seen = new Set();
                links = links.filter((link) => {
                    if (seen.has(link)) return false;
                    seen.add(link);
                    return true;
                });

                this.setState({ links: links });

                // lazy-load the hidden state of the preview widget from localstorage
                if (global.localStorage) {
                    const hidden = global.localStorage.getItem("hide_preview_" + this.props.mxEvent.getId());
                    this.setState({ widgetHidden: hidden });
                }
            }
        }
    },

    findLinks: function(nodes) {
        let links = [];

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.tagName === "A" && node.getAttribute("href")) {
                if (this.isLinkPreviewable(node)) {
                    links.push(node.getAttribute("href"));
                }
            } else if (node.tagName === "PRE" || node.tagName === "CODE" ||
                    node.tagName === "BLOCKQUOTE") {
                continue;
            } else if (node.children && node.children.length) {
                links = links.concat(this.findLinks(node.children));
            }
        }
        return links;
    },

    isLinkPreviewable: function(node) {
        // don't try to preview relative links
        if (!node.getAttribute("href").startsWith("http://") &&
            !node.getAttribute("href").startsWith("https://")) {
            return false;
        }

        // as a random heuristic to avoid highlighting things like "foo.pl"
        // we require the linked text to either include a / (either from http://
        // or from a full foo.bar/baz style schemeless URL) - or be a markdown-style
        // link, in which case we check the target text differs from the link value.
        // TODO: make this configurable?
        if (node.textContent.indexOf("/") > -1) {
            return true;
        } else {
            const url = node.getAttribute("href");
            const host = url.match(/^https?:\/\/(.*?)(\/|$)/)[1];

            // never preview matrix.to links (if anything we should give a smart
            // preview of the room/user they point to: nobody needs to be reminded
            // what the matrix.to site looks like).
            if (host === matrixtoHost) return false;

            if (node.textContent.toLowerCase().trim().startsWith(host.toLowerCase())) {
                // it's a "foo.pl" style link
                return false;
            } else {
                // it's a [foo bar](http://foo.com) style link
                return true;
            }
        }
    },

    _addCodeCopyButton() {
        // Add 'copy' buttons to pre blocks
        Array.from(ReactDOM.findDOMNode(this).querySelectorAll('.mx_EventTile_body pre')).forEach((p) => {
            const button = document.createElement("span");
            button.className = "mx_EventTile_copyButton";
            button.onclick = (e) => {
                const copyCode = button.parentNode.getElementsByTagName("code")[0];
                const successful = this.copyToClipboard(copyCode.textContent);

                const GenericTextContextMenu = sdk.getComponent('context_menus.GenericTextContextMenu');
                const buttonRect = e.target.getBoundingClientRect();

                // The window X and Y offsets are to adjust position when zoomed in to page
                const x = buttonRect.right + window.pageXOffset;
                const y = (buttonRect.top + (buttonRect.height / 2) + window.pageYOffset) - 19;
                const {close} = ContextualMenu.createMenu(GenericTextContextMenu, {
                    chevronOffset: 10,
                    left: x,
                    top: y,
                    message: successful ? _t('Copied!') : _t('Failed to copy'),
                }, false);
                e.target.onmouseleave = close;
            };

            // Wrap a div around <pre> so that the copy button can be correctly positioned
            // when the <pre> overflows and is scrolled horizontally.
            const div = document.createElement("div");
            div.className = "mx_EventTile_pre_container";

            // Insert containing div in place of <pre> block
            p.parentNode.replaceChild(div, p);

            // Append <pre> block and copy button to container
            div.appendChild(p);
            div.appendChild(button);
        });
    },

    onCancelClick: function(event) {
        this.setState({ widgetHidden: true });
        // FIXME: persist this somewhere smarter than local storage
        if (global.localStorage) {
            global.localStorage.setItem("hide_preview_" + this.props.mxEvent.getId(), "1");
        }
        this.forceUpdate();
    },

    onEmoteSenderClick: function(event) {
        const mxEvent = this.props.mxEvent;
        dis.dispatch({
            action: 'insert_mention',
            user_id: mxEvent.getSender(),
        });
    },

    getEventTileOps: function() {
        return {
            isWidgetHidden: () => {
                return this.state.widgetHidden;
            },

            unhideWidget: () => {
                this.setState({ widgetHidden: false });
                if (global.localStorage) {
                    global.localStorage.removeItem("hide_preview_" + this.props.mxEvent.getId());
                }
            },

            getInnerText: () => {
                return this.refs.content.innerText;
            },
        };
    },

    onStarterLinkClick: function(starterLink, ev) {
        ev.preventDefault();
        // We need to add on our scalar token to the starter link, but we may not have one!
        // In addition, we can't fetch one on click and then go to it immediately as that
        // is then treated as a popup!
        // We can get around this by fetching one now and showing a "confirmation dialog" (hurr hurr)
        // which requires the user to click through and THEN we can open the link in a new tab because
        // the window.open command occurs in the same stack frame as the onClick callback.

        // Go fetch a scalar token
        const scalarClient = new ScalarAuthClient();
        scalarClient.connect().then(() => {
            const completeUrl = scalarClient.getStarterLink(starterLink);
            const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
            const integrationsUrl = SdkConfig.get().integrations_ui_url;
            Modal.createTrackedDialog('Add an integration', '', QuestionDialog, {
                title: _t("Add an Integration"),
                description:
                    <div>
                        { _t("You are about to be taken to a third-party site so you can " +
                            "authenticate your account for use with %(integrationsUrl)s. " +
                            "Do you wish to continue?", { integrationsUrl: integrationsUrl }) }
                    </div>,
                button: _t("Continue"),
                onFinished: function(confirmed) {
                    if (!confirmed) {
                        return;
                    }
                    const width = window.screen.width > 1024 ? 1024 : window.screen.width;
                    const height = window.screen.height > 800 ? 800 : window.screen.height;
                    const left = (window.screen.width - width) / 2;
                    const top = (window.screen.height - height) / 2;
                    window.open(completeUrl, '_blank', `height=${height}, width=${width}, top=${top}, left=${left},`);
                },
            });
        });
    },

    _onMouseEnterEditedMarker: function() {
        this.setState({editedMarkerHovered: true});
    },

    _onMouseLeaveEditedMarker: function() {
        this.setState({editedMarkerHovered: false});
    },

    _openHistoryDialog: async function() {
        const MessageEditHistoryDialog = sdk.getComponent("views.dialogs.MessageEditHistoryDialog");
        Modal.createDialog(MessageEditHistoryDialog, {mxEvent: this.props.mxEvent});
    },

    _renderEditedMarker: function() {
        let editedTooltip;
        if (this.state.editedMarkerHovered) {
            const Tooltip = sdk.getComponent('elements.Tooltip');
            const date = this.props.mxEvent.replacingEventDate();
            const dateString = date && formatDate(date);
            editedTooltip = <Tooltip
                tooltipClassName="mx_Tooltip_timeline"
                label={_t("Edited at %(date)s. Click to view edits.", {date: dateString})}
            />;
        }
        return (
            <div
                key="editedMarker" className="mx_EventTile_edited"
                onClick={this._openHistoryDialog}
                onMouseEnter={this._onMouseEnterEditedMarker}
                onMouseLeave={this._onMouseLeaveEditedMarker}
            >{editedTooltip}<span>{`(${_t("edited")})`}</span></div>
        );
    },

    render: function() {
        if (this.props.editState) {
            const MessageEditor = sdk.getComponent('elements.MessageEditor');
            return <MessageEditor editState={this.props.editState} className="mx_EventTile_content" />;
        }
        const mxEvent = this.props.mxEvent;
        const content = mxEvent.getContent();

        const stripReply = ReplyThread.getParentEventId(mxEvent);
        let body = HtmlUtils.bodyToHtml(content, this.props.highlights, {
            disableBigEmoji: content.msgtype === "m.emote" || !SettingsStore.getValue('TextualBody.enableBigEmoji'),
            // Part of Replies fallback support
            stripReplyFallback: stripReply,
        });
        if (this.props.replacingEventId) {
            body = [body, this._renderEditedMarker()];
        }

        if (this.props.highlightLink) {
            body = <a href={this.props.highlightLink}>{ body }</a>;
        } else if (content.data && typeof content.data["org.matrix.neb.starter_link"] === "string") {
            body = <a href="#" onClick={this.onStarterLinkClick.bind(this, content.data["org.matrix.neb.starter_link"])}>{ body }</a>;
        }

        let widgets;
        if (this.state.links.length && !this.state.widgetHidden && this.props.showUrlPreview) {
            const LinkPreviewWidget = sdk.getComponent('rooms.LinkPreviewWidget');
            widgets = this.state.links.map((link)=>{
                return <LinkPreviewWidget
                            key={link}
                            link={link}
                            mxEvent={this.props.mxEvent}
                            onCancelClick={this.onCancelClick}
                            onHeightChanged={this.props.onHeightChanged} />;
            });
        }

        switch (content.msgtype) {
            case "m.emote":
                const name = mxEvent.sender ? mxEvent.sender.name : mxEvent.getSender();
                return (
                    <span ref="content" className="mx_MEmoteBody mx_EventTile_content">
                        *&nbsp;
                        <span
                            className="mx_MEmoteBody_sender"
                            onClick={this.onEmoteSenderClick}
                        >
                            { name }
                        </span>
                        &nbsp;
                        { body }
                        { widgets }
                    </span>
                );
            case "m.notice":
                return (
                    <span ref="content" className="mx_MNoticeBody mx_EventTile_content">
                        { body }
                        { widgets }
                    </span>
                );
            default: // including "m.text"
                return (
                    <span ref="content" className="mx_MTextBody mx_EventTile_content">
                        { body }
                        { widgets }
                    </span>
                );
        }
    },
});
