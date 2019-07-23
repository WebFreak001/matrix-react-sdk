/*
Copyright 2019 New Vector Ltd

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
import { _t } from "../../../../../languageHandler";
import Field from "../../../elements/Field";
import AccessibleButton from "../../../elements/AccessibleButton";
import MatrixClientPeg from '../../../../../MatrixClientPeg';

export default class CustomEmojiSettingsTab extends React.Component {
    constructor() {
        super();
        this.state = {
            emojiName: "",
            emojiFile: null,
            enableEmojiSave: false
        };
    }

    _renderCustomEmoji = (emoji) => {
        var url = MatrixClientPeg.get().mxcUrlToHttp(
            emoji.url,
            24,
            24,
        );
        return (
            <div className="mx_CustomEmoji">
                <img alt={emoji.name} title={emoji.name} src={url} height="24"/>
                <span className="mx_CustomEmojiName">{emoji.name}</span>
            </div>
        );
    }

    _onEmojiNameChanged = (e) => {
        this.setState({
            emojiName: e.target.value,
            enableEmojiSave: true,
        });
    };

    _saveEmoji = async (e) => {
        if (!this.state.emojiName) {
            alert("no name given");
            return;
        }
        if (!this.state.emojiFile) {
            alert("no file given");
            return;
        }

        const client = MatrixClientPeg.get();

        const response = await client.uploadContent(this.state.emojiFile, { onlyContentUri: false });
        const uri = response.content_uri;
        if (typeof uri != "string") {
            console.error(response);
            alert("unexpected response");
            return;
        }
        console.log("Name is ", this.state.emojiName, ", URI is ", uri);

        let emoji = client.getAccountData("org.webfreak.customEmoji");
        if (emoji) emoji = emoji.getContent();
        else emoji = {emoji:[]};
        emoji.emoji.push({
            name: ":" + this.state.emojiName + ":",
            url: uri
        });
        console.log("Emojis are ", emoji);
        await client.setAccountData("org.webfreak.customEmoji", emoji);

        this.setState({
            emojiName: "",
            emojiFile: null,
            enableEmojiSave: false,
        })
    }

    _onEmojiSelected = (e) => {
        if (!e.target.files || !e.target.files.length) {
            this.setState({
                emojiFile: null,
                enableEmojiSave: false,
            });
            return;
        }

        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            this.setState({
                emojiFile: file,
                enableEmojiSave: true,
            });
        };
        reader.readAsDataURL(file);
    };

    render() {
        let emoji = MatrixClientPeg.get().getAccountData("org.webfreak.customEmoji");
        if (emoji) emoji = emoji.getContent();
        else emoji = {emoji:[]};

        return (
            <div className="mx_SettingsTab mx_CustomEmojiSettingsTab">
                {emoji.emoji.map(this._renderCustomEmoji)}
                <div>
                    <p>Add Emoji:</p>
                    <Field id="emojiName" label={_t("Emoji Name")}
                        type="text" value={this.state.emojiName} autoComplete="off"
                        onChange={this._onEmojiNameChanged} />
                    <input type="file" ref="avatarUpload" className="mx_ProfileSettings_emojiUpload"
                            onChange={this._onEmojiSelected} accept="image/*" />
                    <AccessibleButton onClick={this._saveEmoji} kind="primary"
                        disabled={!this.state.enableEmojiSave}>
                        {_t("Save")}
                    </AccessibleButton>
                </div>
            </div>
        );
    }
}
