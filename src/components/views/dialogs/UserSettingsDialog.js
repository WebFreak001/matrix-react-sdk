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
import PropTypes from 'prop-types';
import {Tab, TabbedView} from "../../structures/TabbedView";
import {_t, _td} from "../../../languageHandler";
import GeneralUserSettingsTab from "../settings/tabs/user/GeneralUserSettingsTab";
import SettingsStore from "../../../settings/SettingsStore";
import LabsUserSettingsTab from "../settings/tabs/user/LabsUserSettingsTab";
import SecurityUserSettingsTab from "../settings/tabs/user/SecurityUserSettingsTab";
import NotificationUserSettingsTab from "../settings/tabs/user/NotificationUserSettingsTab";
import PreferencesUserSettingsTab from "../settings/tabs/user/PreferencesUserSettingsTab";
import CustomEmojiSettingsTab from "../settings/tabs/user/CustomEmojiSettingsTab";
import VoiceUserSettingsTab from "../settings/tabs/user/VoiceUserSettingsTab";
import HelpUserSettingsTab from "../settings/tabs/user/HelpUserSettingsTab";
import FlairUserSettingsTab from "../settings/tabs/user/FlairUserSettingsTab";
import sdk from "../../../index";
import SdkConfig from "../../../SdkConfig";

export default class UserSettingsDialog extends React.Component {
    static propTypes = {
        onFinished: PropTypes.func.isRequired,
    };

    _getTabs() {
        const tabs = [];

        tabs.push(new Tab(
            _td("General"),
            "mx_UserSettingsDialog_settingsIcon",
            <GeneralUserSettingsTab closeSettingsFn={this.props.onFinished} />,
        ));
        tabs.push(new Tab(
            _td("Flair"),
            "mx_UserSettingsDialog_flairIcon",
            <FlairUserSettingsTab />,
        ));
        tabs.push(new Tab(
            _td("Notifications"),
            "mx_UserSettingsDialog_bellIcon",
            <NotificationUserSettingsTab />,
        ));
        tabs.push(new Tab(
            _td("Preferences"),
            "mx_UserSettingsDialog_preferencesIcon",
            <PreferencesUserSettingsTab />,
        ));
        tabs.push(new Tab(
            _td("Voice & Video"),
            "mx_UserSettingsDialog_voiceIcon",
            <VoiceUserSettingsTab />,
        ));
        tabs.push(new Tab(
            _td("Security & Privacy"),
            "mx_UserSettingsDialog_securityIcon",
            <SecurityUserSettingsTab />,
        ));
        tabs.push(new Tab(
            _td("Custom Emoji"),
            "mx_UserSettingsDialog_customEmoji",
            <CustomEmojiSettingsTab />,
        ));
        if (SdkConfig.get()['showLabsSettings'] || SettingsStore.getLabsFeatures().length > 0) {
            tabs.push(new Tab(
                _td("Labs"),
                "mx_UserSettingsDialog_labsIcon",
                <LabsUserSettingsTab />,
            ));
        }
        tabs.push(new Tab(
            _td("Help & About"),
            "mx_UserSettingsDialog_helpIcon",
            <HelpUserSettingsTab closeSettingsFn={this.props.onFinished} />,
        ));

        return tabs;
    }

    render() {
        const BaseDialog = sdk.getComponent('views.dialogs.BaseDialog');

        return (
            <BaseDialog className='mx_UserSettingsDialog' hasCancel={true}
                        onFinished={this.props.onFinished} title={_t("Settings")}>
                <div className='ms_SettingsDialog_content'>
                    <TabbedView tabs={this._getTabs()} />
                </div>
            </BaseDialog>
        );
    }
}
