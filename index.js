import { Octokit, App } from "octokit";
import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
(async () => {
    const root = ReactDOM.createRoot( document.getElementById('root') );
    root.render( <Profiles /> );

    // Encode UTF-8 text to Base64
    function encodeToBase64(text) {
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(text);

        let binaryString = '';
        uint8Array.forEach(byte => {
            binaryString += String.fromCharCode(byte);
        });

        return btoa(binaryString);
    }

    // Decode Base64 to UTF-8 text
    function decodeFromBase64(base64) {
        const binaryString = atob(base64);
        const uint8Array = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            uint8Array[i] = binaryString.charCodeAt(i);
        }

        const decoder = new TextDecoder();
        return decoder.decode(uint8Array);
    }

    function onBeforeInput( event ) {
        if ( ! [
            'insertText',
            'deleteContentBackward',
            'deleteContentForward',
            'historyUndo',
            'historyRedo',
        ].includes( event.inputType ) ) {
            console.log( event.inputType )
            event.preventDefault()
        }
    }

    function onEnterKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            document.execCommand('insertText', false, '\n');
        }
    }

    function onPaste( event ) {
        event.preventDefault();
        const text = event.clipboardData.getData( 'text/plain' ).replace( /[\n\r]+/g, ' ' );
        document.execCommand( 'insertText', false, text );
    }

    function Details( { summary, children, modal, ...props } ) {
        const [ open, setOpen ] = useState( false );
        return (
            <details { ...props } onToggle={ ( event ) => {
                if ( event.target !== event.currentTarget ) return;
                setOpen( event.target.open );
            } } className={ modal ? 'modal' : ''}>
                <summary>{ open && modal ? 'Close' : summary }</summary>
                { open && <div className="details-content">
                    { children }
                </div> }
            </details>
        );
    }

    function CoversModal( { book, setBook } ) {
        const [ isbns, setIsbns ] = useState( [] );
        const [ titleAndSeries ] = book.title.split( ':' );
        const [ series, title = series ] = titleAndSeries.split( ';' );

        useEffect( () => {
            fetch(
                'https://openlibrary.org/search.json?title=' +
                encodeURIComponent( stripPunctuation( title ) ) +
                '&author=' + encodeURIComponent( stripPunctuation( _.castArray( book.author )[0] ) )
            ).then( ( response ) => response.json() ).then( ( results ) => {
                const isbns = _.compact( _.uniq( results.docs.reduce( ( acc, doc ) => [ ...acc, ...( doc.isbn || [] ) ], [] ) ) );
                const openLibraryIds = _.compact( _.uniq( results.docs.reduce( ( acc, doc ) => [ ...acc, doc.cover_i ], [] ) ) );
                setIsbns( [
                    ...isbns.map( ( isbn ) => ( { isbn } ) ),
                    ...openLibraryIds.map( ( openLibraryId ) => ( { openLibraryId } ) )
                ] );
            } );
        }, [] );

        return (
            <table>
                <tbody>
                    <tr>{ isbns.map( ( { isbn, openLibraryId } ) =>
                        <td style={ {minWidth: '100px'} } key={isbn||openLibraryId}>
                            <img
                                onClick={ ( event ) => {
                                    setBook( { isbn, openLibraryId } );
                                    event.target.closest( 'details' ).removeAttribute( 'open' );
                                } }
                                className={ ( isbn ? book.isbn === isbn : book.openLibraryId === openLibraryId ) ? 'is-selected' : '' }
                                src={ `https://covers.openlibrary.org/b/${ isbn ? 'isbn' : 'id' }/${ isbn || openLibraryId }-L.jpg` }
                                loading="lazy"
                            />
                        </td>
                    ) }</tr>
                </tbody>
            </table>
        );
    }

    function useRefEffect( callback, dependencies ) {
        const cleanup = useRef();
        return useCallback( ( node ) => {
            if ( node ) {
                cleanup.current = callback( node );
            } else if ( cleanup.current ) {
                cleanup.current();
            }
        }, dependencies );
    }

    function stripPunctuation( string ) {
        return removeAccents( string ).replace( /[?.,:;()]/g, ' ' ).replace( /\s+/g, ' ' );
    }

    function findBook( books, name ) {
        return books.find( ( book ) => `${ book.title }\n${ _.castArray( book.author ).join( '\n' ) }` === name );
    }

    function fetchJSONP(url) {
        return new Promise((resolve, reject) => {
            // Generate a unique callback name
            const callbackName = `jsonp_callback_${Math.round(100000 * Math.random())}`;

            // Create the script element
            const script = document.createElement('script');
            script.src = `${url}&callback=${callbackName}`;
            script.onerror = function() {
                reject(new Error(`JSONP request to ${url} failed`));
                // Clean up in case of error
                delete window[callbackName];
            };

            // Create the callback function
            window[callbackName] = function(data) {
                resolve(data);
                // Clean up: remove the script element and the global callback
                document.body.removeChild(script);
                delete window[callbackName];
            };

            // Append the script to the document to initiate the request
            document.body.appendChild(script);
        });
    }

    function Extract( { name, author: _author, featured, negative, extract: mention, __external, unquote, time, chapter, setExtract, remove, books, setBooks, domain, iframeRef } ) {
        const book = findBook( books, name );
        const [ bookResults, setBookResults ] = useState();
        const [ selectedResult, setSelectedResult ] = useState();
        const [ author, setAuthor ] = useState( _author );
        const [ coverIds, setCoverIds ] = useState();
        const [ pickedCoverIndex, setCoverIndex ] = useState( 0 );

        function getBookId( b ) {
            return `${ b.title }\n${ _.castArray( b.author ).join( '\n' ) }`;
        }

        useEffect( () => {
            if ( book ) return;

            const compatBook = books.find( ( book ) => book.title === name );

            if ( ! compatBook ) return;

            setExtract( ( extract ) => ( {
                ...extract,
                name: getBookId( compatBook ),
                author: undefined,
            } ) );
        }, [] );

        function setBook( newBook ) {
            setBooks( ( books ) => {
                const book = books.find( ( book ) => `${ book.title }\n${ _.castArray( book.author ).join( '\n' ) }` === name );
                if ( ! book ) return books;
                const index = books.indexOf( book );
                return [
                    ...books.slice(0, index),
                    {
                        ...books[ index ],
                        ...newBook
                    },
                    ...books.slice(index + 1)
                ]
            } );
        }

        function onChangeResult( event ) {
            setSelectedResult( event.target.value );
        }

        function toggleFeatured() {
            setExtract( ( extract ) => ( {
                ...extract,
                featured: ! featured,
            } ) );
        }

        function toggleNegative() {
            setExtract( ( extract ) => ( {
                ...extract,
                negative: ! negative,
            } ) );
        }

        function toggleExternal() {
            setExtract( ( extract ) => ( {
                ...extract,
                __external: __external ? undefined : true,
            } ) );
        }

        function toggleUnquote() {
            setExtract( ( extract ) => ( {
                ...extract,
                unquote: unquote ? undefined : true,
            } ) );
        }

        function updateMention( event ) {
            const newMention = event.target.textContent.trim();
            if ( mention === newMention ) return;
            setExtract( ( extract ) => ( {
                ...extract,
                extract: newMention,
            } ) );
        }

        function onFetchFirstCover( book ) {
            const [ titleAndSeries ] = book.title.split( ':' );
            const [ series, title = series ] = titleAndSeries.split( ';' );
            fetch(
                'https://openlibrary.org/search.json?title=' +
                encodeURIComponent( stripPunctuation( title ) ) +
                '&author=' + encodeURIComponent( stripPunctuation( _.castArray( book.author )[0] ) )
            ).then( ( response ) => response.json() ).then( ( results ) => {
                const [ firstResult ] = results.docs;
                if ( firstResult?.cover_i ) {
                    setBook( {
                        openLibraryId: firstResult.cover_i
                    } );
                } else {
                    alert( 'First book has no cover, try picking one.' );
                }
            } );
        }

        function onDelete( event ) {
            if ( event.key === 'Backspace' && ! event.target.textContent ) {
                remove();
                event.preventDefault();
            }
        }

        function parseTimeToSeconds(timeString) {
            const timeParts = timeString.split(':').reverse();
            const seconds = parseInt(timeParts[0], 10) || 0;
            const minutes = parseInt(timeParts[1], 10) || 0;
            const hours = parseInt(timeParts[2], 10) || 0;

            const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
            return totalSeconds;
        }

        const tRegex = /^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/;

        function findFirstTimestamp(text) {
            const match = text.match(tRegex);
            return match ? match[0].trim() : null;
        }

        function removeTimestamps(text) {
            return text.split('\n').map(line => line.replace(tRegex, '').trim()).filter(Boolean).join(' ');
        }

        const [ title, ...authors ] = name.split('\n');

        const [ tempTitle, setTempTitle ] = useState();
        const [ tempAuthors, setTempAuthors ] = useState();

        useEffect( () => {
            if ( book ) return;
            const [ title, ...authors ] = name.split('\n');
            setTempTitle( title );
            setTempAuthors( authors );
        }, [ book ] );

        function addNewBook() {
            setBooks( ( books ) => [
                ...books,
                {
                    title: tempTitle,
                    author: tempAuthors,
                },
            ] );
            setExtract( ( extract ) => {
                return {
                    ...extract,
                    name: [ tempTitle, ...tempAuthors ].join( '\n' ),
                };
            } );
            onFetchFirstCover( {
                title: tempTitle,
                author: tempAuthors,
            } );
            setTempTitle();
            setTempAuthors();
        }

        const timeRef = useRefEffect( ( element ) => {
            function onPasteMention( event ) {
                const timeString = event.clipboardData.getData('text');
                const seconds = parseTimeToSeconds(timeString);
                setExtract( ( extract ) => ( {
                    ...extract,
                    time: seconds,
                } ) );
                event.preventDefault();
            }

            element.addEventListener( 'paste', onPasteMention );
            element.addEventListener( 'beforeinput', onBeforeInput );
            return () => {
                element.removeEventListener( 'paste', onPasteMention );
                element.removeEventListener( 'beforeinput', onBeforeInput );
            };
        }, [] );
        const mentionRef = useRefEffect( ( element ) => {
            function onPasteMention( event ) {
                const text = event.clipboardData.getData( 'text/plain' );
                const timestamp = findFirstTimestamp(text);

                event.preventDefault();

                console.log( 'onPasteMention', text, timestamp )

                if ( timestamp ) {
                    document.execCommand( 'insertText', false, removeTimestamps(text) );

                    if ( ! time || confirm( 'Overwrite timestamp?' ) ) {
                        setExtract( ( extract ) => ( {
                            ...extract,
                            time: parseTimeToSeconds(timestamp),
                        } ) );
                    }
                } else {
                    document.execCommand( 'insertText', false, text );
                }
            }

            element.addEventListener( 'paste', onPasteMention );
            element.addEventListener( 'beforeinput', onBeforeInput );
            return () => {
                element.removeEventListener( 'paste', onPasteMention );
                element.removeEventListener( 'beforeinput', onBeforeInput );
            };
        }, [] )

        console.log({domain})

        return <>
            <tr>
                <td>
                    { book && ! ( book.isbn || book.openLibraryId ) && <button
                        onClick={ () => onFetchFirstCover( book ) }
                    >
                        Pick first cover
                    </button> }
                    { book && <Details modal summary={
                        <>
                            { book && ( book.isbn || book.openLibraryId ) && <img
                                src={ `https://covers.openlibrary.org/b/${ book.isbn ? 'isbn' : 'id' }/${ book.isbn || book.openLibraryId }-L.jpg` }
                                style={ { maxWidth: '100px' } }
                                loading="lazy"
                            /> }
                            { book && ! ( book.isbn || book.openLibraryId ) && <button
                                >
                                    Pick cover
                                </button> }
                        </>
                    }>
                        <button onClick={ ( event ) => {
                            setBook( {
                                isbn: undefined,
                                openLibraryId: undefined,
                            } );
                            event.target.closest( 'details' ).removeAttribute( 'open' );
                        } }>Remove cover</button>
                        <CoversModal book={ book } setBook={ setBook } />
                    </Details> }
                    { ! book && 'First insert a book.' }
                </td>
                <td>
                    <div
                        data-placeholder="Title"
                        contentEditable={ ! book }
                        suppressContentEditableWarning
                        ref={ useRefEffect( ( element ) => {
                            element.addEventListener( 'paste', onPaste );
                            element.addEventListener( 'beforeinput', onBeforeInput );
                            return () => {
                                element.removeEventListener( 'paste', onPaste );
                                element.removeEventListener( 'beforeinput', onBeforeInput );
                            };
                        }, [] ) }
                        onInput={ () => {
                            const newTitle = event.target.textContent.trim();
                            setTempTitle( newTitle );
                        } }
                        onKeyDown={ onDelete }
                        readOnly={ !! book }
                    >
                        { title }
                    </div>
                    <div
                        data-placeholder="Authors"
                        contentEditable={ ! book }
                        suppressContentEditableWarning
                        ref={ useRefEffect( ( element ) => {
                            element.addEventListener( 'paste', onPaste );
                            element.addEventListener( 'beforeinput', onBeforeInput );
                            return () => {
                                element.removeEventListener( 'paste', onPaste );
                                element.removeEventListener( 'beforeinput', onBeforeInput );
                            };
                        }, [] ) }
                        onInput={ () => {
                            const newAuthors = event.target.textContent.split(',').map(author => author.trim());
                            setTempAuthors( newAuthors );
                        } }
                        readOnly={ !! book }
                    >
                        { authors.join( ', ' ) }
                    </div>
                    { ! book && ( tempTitle || !! tempAuthors?.length ) && <>
                        <hr />
                        <p>Select existing book:</p>
                        <ul>
                        { books.reduce( ( acc, book ) => {
                            if ( acc.length === 10 ) return acc;

                            const [tempMainTitle] = _.kebabCase( tempTitle ).split( ':' );
                            const [mainTitle] = _.kebabCase( book.title ).split( ':' );
                            
                            // check authors
                            if ( tempAuthors?.length ) {
                                const bookAuthors = _.castArray( book.author );
                                const tempAuthorsMatch = tempAuthors.every( tempAuthor => {
                                    const _tempAuthor = _.kebabCase( tempAuthor );
                                    return bookAuthors.some( bookAuthor => {
                                        const _bookAuthor = _.kebabCase( bookAuthor );
                                        return _bookAuthor.includes( _tempAuthor )
                                    } )
                                } );
                                if ( ! tempAuthorsMatch ) return acc;
                            }

                            if ( mainTitle.includes( tempMainTitle ) ) {
                                acc.push( book );
                            }

                            return acc;
                        }, [] ).map( ( book, i ) => {
                            return (
                                <li key={i} onClick={ () => {
                                    setExtract( ( extract ) => ( {
                                        ...extract,
                                        name: getBookId( book ),
                                    } ) );
                                } }>{ book.title } by { _.castArray( book.author ).join( ', ' ) }</li>
                            );
                        } ) }
                        </ul>
                    </> }
                    { ! book && ( tempTitle ) && <button onClick={ addNewBook }>Or insert new book</button> }
                </td>
                { domain && domain !== 'x.com' && <td>
                    <div
                        data-placeholder="Time"
                        contentEditable
                        suppressContentEditableWarning
                        ref={ timeRef }
                        onBlur={ ( event ) => {
                            const text = event.target.textContent.trim();
                            const newTime = parseInt( text, 10 ) || undefined;
                            if ( newTime !== time ) {
                                setExtract( ( extract ) => ( {
                                    ...extract,
                                    time: newTime,
                                } ) );
                            }
                        } }
                    >
                        { time }
                    </div>
                    { time && <button onClick={ () => {
                        const url = new URL( iframeRef.current.src );
                        // set time
                        url.searchParams.set( 'autoplay', '1' );
                        url.searchParams.set( 'start', time );
                        iframeRef.current.src = url.toString();
                        iframeRef.current.focus();
                    } }>Play</button> }
                </td> }
                { ! domain && <td>
                    <div
                        data-placeholder="Chapter"
                        contentEditable
                        suppressContentEditableWarning
                        onPaste={ onPaste }
                        onKeyDown={ onEnterKeyDown }
                        onBlur={ ( event ) => {
                            const newChapter = event.target.textContent.trim() ?? undefined;
                            if ( newChapter !== chapter ) {
                                setExtract( ( extract ) => ( {
                                    ...extract,
                                    chapter: newChapter,
                                } ) );
                            }
                        } }
                    >
                        { chapter }
                    </div>
                </td> }
                { domain !== 'x.com' &&
                    <td
                        data-placeholder="Mention"
                        contentEditable
                        suppressContentEditableWarning
                        ref={ mentionRef }
                        onKeyDown={ onEnterKeyDown }
                        onBlur={ updateMention }
                    >
                        { mention }
                    </td>
                }
                <td><input type="checkbox" checked={ featured === true } onChange={ toggleFeatured } /></td>
                <td><input type="checkbox" checked={ negative === true } onChange={ toggleNegative } /></td>
                <td><input type="checkbox" checked={ __external === true } onChange={ toggleExternal } /></td>
                <td><input type="checkbox" checked={ unquote === true } onChange={ toggleUnquote } /></td>
            </tr>
        </>;
    }

    function Profiles() {
        const [octokit, setOctokit] = useState(
            sessionStorage.getItem('password') ? new Octokit({ auth: sessionStorage.getItem('password') }) : undefined
        );
        const [initialBooks, setInitialBooks] = useState([]);
        const [ books, setBooks ] = useState( [] );
        const [ profiles, setProfiles ] = useState( [] );

        useEffect(() => {
            if ( ! octokit ) return;
            octokit.rest.repos.getContent({
                owner: 'recommentions',
                repo: 'source',
                path: 'profiles.jsonl',
            }).catch( () => {
                alert('Loading profiles failed.');
            }).then( ( { data } ) => {
                const lines = decodeFromBase64( data.content ).split( '\n' );
                const profiles = lines.map( ( line ) => JSON.parse( line ) );
                setProfiles( profiles );
                octokit.rest.repos.getContent({
                    owner: 'recommentions',
                    repo: 'source',
                    path: 'books/books.jsonl',
                }).then( ( { data } ) => {
                    const lines = decodeFromBase64( data.content ).split( '\n' );
                    const books = lines.map( ( line ) => JSON.parse( line ) );
                    setBooks( books );
                    setInitialBooks( books );
                } ).catch( () => {
                    setOctokit();
                    sessionStorage.removeItem('password');
                    alert('Loading books failed.');
                });
            } )
        },[octokit]);
        
        const [username, setUsername] = useState();
        const [name, setName] = useState('');
        const [url, setURL] = useState('');
        const [text, setText] = useState('');
        const [date, setDate] = useState('');
        const [extracts, setExtracts] = useState([]);
        const [isDuplicate, setDuplicate] = useState(false);

        function onPasteURL( event ) {
            const source = event.clipboardData.getData( 'text/plain' );
            console.log({source})
            event.preventDefault();
            setURL( source );
            checkDuplicate( source );

            if ( /x\.com/.test( source ) ) {
                fetchJSONP( 'https://publish.twitter.com/oembed?url=' + source ).then( ( response ) => {
                    const doc = document.implementation.createHTMLDocument( '' );
                    doc.body.innerHTML = response.html;

                    console.log( doc, response.html)

                    Promise.all(
                        Array.from( doc.querySelectorAll( 'p a' ) )
                        .filter( ( a ) => a.hostname === 't.co' && a.href === a.textContent )
                        .map( ( a ) => {
                            const secureHref = a.href.replace( /^http:/, 'https:' );
                            return fetch( secureHref ).then( ( response ) => response.text() ).then( ( text ) => {
                                const match = text.match( /\<title>([^<]+)<\/title>/i );
                                
                                if ( match ) {
                                    a.href = match[ 1 ];
                                    a.textContent = match[ 1 ];
                                }
                            } );
                        } )
                    ).then( () => {
                        const contentTarget = doc.querySelector( 'p' );
                        contentTarget.innerHTML = contentTarget.innerHTML.replace( /<br ?\/?>/gi, '\n' );

                        setText(contentTarget.textContent);
                        setDate(( new Date( doc.querySelector( 'blockquote > a' ).textContent + ' UTC' ) ).toISOString().split('T')[0]);
                    } );
                } );
            }
        }

        useEffect(() => {
            if (octokit) {
                octokit.rest.users.getAuthenticated().then( ( { data } ) => {
                    setUsername(data.login)
                } ).catch( () => {
                    setOctokit();
                    sessionStorage.removeItem('password');
                } );
            }
        },[octokit]);

        function onAdd( additions = [ { name: '' } ] ) {
            setExtracts( ( state ) => [
                ...( state || [] ),
                ...additions,
            ] );
        }

        const iframeRef = useRef();

        let domain;

        if ( url ) {
            try {
                domain = new URL( url ).host.replace( /^www\./, '' );
            } catch ( e ) {}
        }

        const source = {
            name,
            source: url,
            content: text,
            date,
            extracts,
        };

        const newBooks = books.filter( book => ! initialBooks.includes( book ) );

        function onSubmit(event) {
            event.preventDefault();
            const form = event.target.closest('form');
            if ( form.password?.value ) {
                sessionStorage.setItem('password', form.password.value);
                setOctokit( new Octokit({ auth: form.password.value }))
            } else {
                if ( ! url ) {
                    alert('URL is required.');
                    return;
                }
                if ( ! date ) {
                    alert('Date is required.');
                    return;
                }

                if ( ! extracts.length ) {
                    alert('At least one book is required.');
                    return;
                }

                if ( ! name ) {
                    alert('Profile is required.');
                    return;
                }

                // Make sure all books have a title and author.
                if ( newBooks.some( ( book ) => ! book.title || ! book.author ) ) {
                    alert('All books must have a title and author.');
                    return;
                }

                Promise.all( newBooks.map( ( book ) => {
                    return octokit.rest.repos.createOrUpdateFileContents({
                        owner: 'recommentions',
                        repo: 'source',
                        path: `books/${_.kebabCase(book.title + ' by ' + _.castArray(book.author).join(', '))}.json`,
                        message: `Add book: ${book.title} by ${_.castArray(book.author).join(', ')}`,
                        content: encodeToBase64( JSON.stringify( book ) ),
                    })
                } ) ).catch( ( error ) => {
                    console.log(error);
                    alert('Saving books failed.');
                }).then( () => {
                    setInitialBooks( books );
                    octokit.rest.repos.createOrUpdateFileContents({
                        owner: 'recommentions',
                        repo: 'source',
                        path: `sources/${ _.kebabCase(source.name) }-${ _.kebabCase(source.source) }.json`,
                        message: `Add source for ${source.name}`,
                        content: encodeToBase64( JSON.stringify( source ) ),
                    }).then( ( { data } ) => {
                        alert(`Saved source for ${source.name}.`);
                        setExtracts([]);
                        setURL('');
                        setText('');
                        setDate('');
                    } ).catch( ( error ) => {
                        alert('Saving source failed.');
                    });
                });
            }
        }

        function checkDuplicate( value ) {
            octokit.rest.repos.getContent({
                owner: 'recommentions',
                repo: 'source',
                path: 'sources.txt',
            }).then( ( { data } ) => {
                const lines = decodeFromBase64( data.content ).split( '\n' );
                setDuplicate( lines.includes( value ) );
            } );
        }

        return (
            <form onSubmit={(event) => {
                event.preventDefault();
            }} method="POST" action="">
                { !octokit && <>
                    <input id="username" name="username" type="text" autoComplete="username" placeholder="username" />
                    <input id="password" name="password" type="password" autoComplete="current-password" placeholder="password" />
                    </> }
                {username && <>
                    <div>Logged in as {username}.</div>
                    <div>
                        <div className="autocomplete-wrapper">
                            <input
                                type="text"
                                value={name}
                                onChange={(event) => {
                                    setName(event.target.value);
                                }}
                                placeholder="Select or type profile name"
                            />
                            {name && (
                                <ul className="autocomplete-list">
                                    {profiles
                                        .filter(profile => profile.name.toLowerCase().includes(name.toLowerCase()))
                                        .map((profile, index) => (
                                            <li
                                                key={index}
                                                onClick={() => setName(profile.name)}
                                            >
                                                {profile.name}
                                            </li>
                                        ))
                                    }
                                </ul>
                            )}
                        </div>
                        <button onClick={ () => {} }>Insert new profile</button>
                    </div>
                    <div>
                        <input type="text" onPaste={ onPasteURL } value={url} placeholder="URL or Book Title"
                            onChange={(event) => setURL(event.target.value)}
                            onBlur={(event) => {
                                checkDuplicate(url);
                            }}
                            style={{width:'100%'}}
                        />
                        {isDuplicate && <mark>Duplicate!</mark>}
                        {domain === 'twitter.com' && <mark>use x.com!</mark>}
                        {domain === 'youtu.be' && <mark>use youtube.com!</mark>}
                    </div>
                    <div>
                        <textarea
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder="Text"
                            style={{width:'100%'}}
                            rows="10"
                        />
                    </div>
                    <div>
                        <input
                            type="text"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            placeholder="yyy-mm-dd, yyyy-mm, yyyy, or try pasting"
                            onPaste={ ( event ) => {
                                const text = event.clipboardData.getData( 'text/plain' );

                                if ( /^[0-9+]$/.test( text ) ) {
                                    return;
                                }

                                let date;
                                try{
                                    date = new Date( text +  ' UTC' ).toISOString().split('T')[0]
                                } catch ( e ) {
                                    date = text.split('T')[0]
                                }

                                event.preventDefault();
                                setDate(date);
                            } }
                            style={{width:'100%'}}
                        />
                    </div>
                    { books.length > 0 && <table>
                        <colgroup>
                            <col />
                            <col style={ {width:'20%'}} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th scope="col">Cover</th>
                                <th scope="col">Book</th>
                                { domain && domain !== 'x.com' && <th scope="col">Time</th> }
                                { ! domain && <th scope="col">Chapter</th> }
                                { domain !== 'x.com' && <th scope="col">Extract (Optional)</th> }
                                <th scope="col">Featured</th>
                                <th scope="col">Negative</th>
                                <th scope="col">External</th>
                                <th scope="col">Unquote</th>
                            </tr>
                        </thead>
                        <tbody>
                            { extracts.map( ( { name, author, featured, negative, extract, __external, unquote, time, chapter }, index ) => {
                                function setExtract( newAttributes ) {
                                    setExtracts( ( state ) => [
                                        ...state.slice(0, index),
                                        newAttributes( state[ index ] ),
                                        ...state.slice(index + 1)
                                    ] );
                                }
                                function remove() {
                                    setExtracts( ( state ) => [
                                        ...state.slice(0, index),
                                        ...state.slice(index + 1)
                                    ] );
                                }
                                return <Extract key={ index } { ...{ name, author, featured, negative, extract, __external, unquote, time, chapter, setExtract, remove, books, setBooks, domain, iframeRef } } />
                            } ) }
                            <tr colSpan="5"><td><button onClick={ () => onAdd() }>Add</button></td></tr>
                        </tbody>
                    </table> }
                </>}
                <button type="submit" onClick={onSubmit} disabled={ isDuplicate || domain === 'twitter.com' || domain === 'youtu.be' }>Submit</button>
                <pre>{ JSON.stringify( source, null, 2 ) }</pre>
                {newBooks.map((book, index) => <pre key={index}>{JSON.stringify(book, null, 2)}</pre>)}
            </form>
        );
    }
})()

// Are you sure you want to leave
window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = 'Are you sure?';
});