import type { Props } from '@infrastructure/client/engine'

export const Header = ({ Title, Links, Buttons }: Props['Header']) => (
  <header>
    <nav className="bg-white border-gray-200 px-4 lg:px-6 py-2.5 dark:bg-gray-800">
      <div className="flex flex-wrap justify-between items-center mx-auto max-w-screen-xl">
        <a href="/" className="flex items-center">
          <Title />
        </a>
        {Links ? (
          <div className="justify-between items-center flex w-auto">
            <ul className="flex flex-row font-medium space-x-8 mt-0">
              {Links.map((Link, index) => (
                <li key={index}>
                  <Link />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {Buttons ? (
          <div className="flex items-center">
            {Buttons.map((Button, index) => (
              <Button key={index} className="ml-2" />
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  </header>
)
