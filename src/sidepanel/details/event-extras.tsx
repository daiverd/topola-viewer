import {useState} from 'react';
import {useIntl} from 'react-intl';
import {
  Icon,
  Item,
  List,
  Menu,
  MenuItemProps,
  Popup,
  SemanticICONS,
  Tab,
} from 'semantic-ui-react';
import {Source} from '../../util/gedcom_util';
import {AdditionalFiles, FileEntry} from './additional-files';
import {MultilineText} from './multiline-text';
import {Sources} from './sources';
import {WrappedImage} from './wrapped-image';

export interface Image {
  url: string;
  filename: string;
  title?: string;
}

interface Props {
  images?: Image[];
  notes?: string[][];
  sources?: Source[];
  indi: string;
  files?: FileEntry[];
}

function eventImages(images: Image[] | undefined) {
  return (
    !!images &&
    images.map((image, index) => (
      <List key={index}>
        <List.Item>
          <WrappedImage
            url={image.url}
            filename={image.filename}
            title={image.title}
          />
        </List.Item>
      </List>
    ))
  );
}

function eventNotes(notes: string[][] | undefined) {
  return (
    !!notes?.length &&
    notes.map((note, index) => (
      <div key={index}>
        <MultilineText
          lines={note.map((line, index) => (
            <i key={index}>{line}</i>
          ))}
        />
      </div>
    ))
  );
}

export function EventExtras(props: Props) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [indi, setIndi] = useState('');

  if (!indi || indi !== props.indi) {
    setActiveIndex(-1);
    setIndi(props.indi);
  }

  function handleTabOnClick(
    _event: React.MouseEvent<HTMLAnchorElement>,
    menuItemProps: MenuItemProps,
  ) {
    menuItemProps.index !== undefined && activeIndex !== menuItemProps.index
      ? setActiveIndex(menuItemProps.index)
      : setActiveIndex(-1);
  }

  const intl = useIntl();
  const extras: Array<{
    key: string;
    label: string;
    icon: SemanticICONS;
    render: () => React.ReactNode;
  } | false> = [
    !!props.images?.length && {
      key: 'images',
      label: intl.formatMessage({id: 'extras.images', defaultMessage: 'Images'}),
      icon: 'camera',
      render: () => <Tab.Pane>{eventImages(props.images)}</Tab.Pane>,
    },
    !!props.notes?.length && {
      key: 'notes',
      label: intl.formatMessage({id: 'extras.notes', defaultMessage: 'Notes'}),
      icon: 'sticky note outline',
      render: () => <Tab.Pane>{eventNotes(props.notes)}</Tab.Pane>,
    },
    !!props.sources?.length && {
      key: 'sources',
      label: intl.formatMessage({
        id: 'extras.sources',
        defaultMessage: 'Sources',
      }),
      icon: 'quote right',
      render: () => (
        <Tab.Pane>
          <Sources sources={props.sources} />
        </Tab.Pane>
      ),
    },
    !!props.files?.length && {
      key: 'files',
      label: intl.formatMessage({
        id: 'extras.files',
        defaultMessage: 'Additional files',
      }),
      icon: 'file alternate outline',
      render: () => (
        <Tab.Pane>
          <AdditionalFiles files={props.files} />
        </Tab.Pane>
      ),
    },
  ];

  // Each icon is a toggle button: it was an <a> without href, so it had no
  // name and could not be reached or operated with the keyboard.
  const panes = extras
    .flatMap((extra) => (extra ? [extra] : []))
    .map((extra, index) => ({
      menuItem: (
        <Menu.Item
          fitted
          key={extra.key}
          role="button"
          tabIndex={0}
          aria-label={extra.label}
          aria-expanded={activeIndex === index}
          onClick={handleTabOnClick}
          onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          <Popup
            content={extra.label}
            size="mini"
            position="bottom center"
            trigger={<Icon circular name={extra.icon} />}
          />
        </Menu.Item>
      ),
      render: extra.render,
    }));

  if (panes.length) {
    return (
      <Item.Description>
        <Tab
          className="event-extras"
          activeIndex={activeIndex}
          renderActiveOnly={true}
          menu={{
            tabular: true,
            attached: true,
            compact: true,
            borderless: true,
          }}
          panes={panes}
        />
      </Item.Description>
    );
  }
  return null;
}
