/*
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

import React from 'react';
import PropTypes from 'prop-types';
import * as HtmlUtils from '../../../HtmlUtils';
import {formatTime} from '../../../DateUtils';
import {MatrixEvent} from 'matrix-js-sdk';
import {pillifyLinks} from '../../../utils/pillify';
import { _t } from '../../../languageHandler';
import sdk from '../../../index';
import MatrixClientPeg from '../../../MatrixClientPeg';
import Modal from '../../../Modal';
import classNames from 'classnames';
import DiffMatchPatch from 'diff-match-patch';

function getReplacedContent(event) {
    const originalContent = event.getOriginalContent();
    return originalContent["m.new_content"] || originalContent;
}

function isPlainMessage(event) {
    const content = getReplacedContent(event);
    return content.msgtype === "m.text" && !content.format;
}

export default class EditHistoryMessage extends React.PureComponent {
    static propTypes = {
        // the message event being edited
        mxEvent: PropTypes.instanceOf(MatrixEvent).isRequired,
        previousEdit: PropTypes.instanceOf(MatrixEvent).isRequired,
        isBaseEvent: PropTypes.bool,
    };

    constructor(props) {
        super(props);
        const cli = MatrixClientPeg.get();
        const {userId} = cli.credentials;
        const event = this.props.mxEvent;
        const room = cli.getRoom(event.getRoomId());
        if (event.localRedactionEvent()) {
            event.localRedactionEvent().on("status", this._onAssociatedStatusChanged);
        }
        const canRedact = room.currentState.maySendRedactionForEvent(event, userId);
        this.state = {canRedact, sendStatus: event.getAssociatedStatus()};
    }

    _onAssociatedStatusChanged = () => {
        this.setState({sendStatus: this.props.mxEvent.getAssociatedStatus()});
    };

    _onRedactClick = async () => {
        const event = this.props.mxEvent;
        const cli = MatrixClientPeg.get();
        const ConfirmAndWaitRedactDialog = sdk.getComponent("dialogs.ConfirmAndWaitRedactDialog");

        Modal.createTrackedDialog('Confirm Redact Dialog', 'Edit history', ConfirmAndWaitRedactDialog, {
            redact: () => cli.redactEvent(event.getRoomId(), event.getId()),
        }, 'mx_Dialog_confirmredact');
    };

    _onViewSourceClick = () => {
        const ViewSource = sdk.getComponent('structures.ViewSource');
        Modal.createTrackedDialog('View Event Source', 'Edit history', ViewSource, {
            roomId: this.props.mxEvent.getRoomId(),
            eventId: this.props.mxEvent.getId(),
            content: this.props.mxEvent.event,
        }, 'mx_Dialog_viewsource');
    };

    pillifyLinks() {
        // not present for redacted events
        if (this.refs.content) {
            pillifyLinks(this.refs.content.children, this.props.mxEvent);
        }
    }

    componentDidMount() {
        this.pillifyLinks();
    }

    componentWillUnmount() {
        const event = this.props.mxEvent;
        if (event.localRedactionEvent()) {
            event.localRedactionEvent().off("status", this._onAssociatedStatusChanged);
        }
    }

    componentDidUpdate() {
        this.pillifyLinks();
    }

    _renderActionBar() {
        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');
        // hide the button when already redacted
        let redactButton;
        if (!this.props.mxEvent.isRedacted() && !this.props.isBaseEvent) {
            redactButton = (
                <AccessibleButton onClick={this._onRedactClick} disabled={!this.state.canRedact}>
                    {_t("Remove")}
                </AccessibleButton>
            );
        }
        const viewSourceButton = (
            <AccessibleButton onClick={this._onViewSourceClick}>
                {_t("View Source")}
            </AccessibleButton>
        );
        // disabled remove button when not allowed
        return (
            <div className="mx_MessageActionBar">
                {redactButton}
                {viewSourceButton}
            </div>
        );
    }

    _renderBodyDiff(oldBody, newBody) {
        const dpm = new DiffMatchPatch();
        const diff = dpm.diff_main(oldBody, newBody);
        dpm.diff_cleanupSemantic(diff);
        return diff.map(([modifier, text], i) => {
            // not using del and ins tags here as del is used for strikethrough
            if (modifier < 0) {
                return (<span className="mx_EditHistoryMessage_deletion" key={i}>{text}</span>);
            } else if (modifier > 0) {
                return (<span className="mx_EditHistoryMessage_insertion" key={i}>{text}</span>);
            } else {
                return text;
            }
        });
    }

    render() {
        const {mxEvent} = this.props;
        const content = getReplacedContent(mxEvent);
        let contentContainer;
        if (mxEvent.isRedacted()) {
            const UnknownBody = sdk.getComponent('messages.UnknownBody');
            contentContainer = <UnknownBody mxEvent={this.props.mxEvent} />;
        } else {
            let contentElements;
            if (isPlainMessage(mxEvent) && this.props.previousEdit && isPlainMessage(this.props.previousEdit)) {
                contentElements = this._renderBodyDiff(getReplacedContent(this.props.previousEdit).body, content.body);
            } else {
                contentElements = HtmlUtils.bodyToHtml(content, null, {stripReplyFallback: true});
            }
            if (mxEvent.getContent().msgtype === "m.emote") {
                const name = mxEvent.sender ? mxEvent.sender.name : mxEvent.getSender();
                contentContainer = (
                    <div className="mx_EventTile_content" ref="content">*&nbsp;
                        <span className="mx_MEmoteBody_sender">{ name }</span>
                        &nbsp;{contentElements}
                    </div>
                );
            } else {
                contentContainer = <div className="mx_EventTile_content" ref="content">{contentElements}</div>;
            }
        }

        const timestamp = formatTime(new Date(mxEvent.getTs()), this.props.isTwelveHour);
        const isSending = (['sending', 'queued', 'encrypting'].indexOf(this.state.sendStatus) !== -1);
        const classes = classNames({
            "mx_EventTile": true,
            "mx_EventTile_redacted": mxEvent.isRedacted(),
            "mx_EventTile_sending": isSending,
            "mx_EventTile_notSent": this.state.sendStatus === 'not_sent',
        });
        return (
            <li>
                <div className={classes}>
                    <div className="mx_EventTile_line">
                        <span className="mx_MessageTimestamp">{timestamp}</span>
                        { contentContainer }
                        { this._renderActionBar() }
                    </div>
                </div>
            </li>
        );
    }
}
